// A tile view for previewing a Document in a listing.
dc.ui.Document = Backbone.View.extend({

  // To display if the document failed to upload.
  ERROR_MESSAGE : "The document failed to import successfully. We've been notified of the problem, \
    and periodically review failed documents. You can try deleting this document, \
    re-saving the PDF with Acrobat or Preview, and reducing the file size before uploading again.\
    For direct help, email us at <span class=\"email\">support@documentcloud.org</span>",

  className : 'document',

  events : {
    'mousedown .doc_title'      : '_noSelect',
    'click .doc_title'          : 'select',
    'contextmenu .doc_title'    : 'showMenu',
    'dblclick .doc_title'       : 'viewDocument',
    'click .icon.doc'           : 'select',
    'contextmenu .icon.doc'     : 'showMenu',
    'dblclick .icon.doc'        : 'viewDocument',
    'click .show_notes'         : 'toggleNotes',
    'click .title .edit_glyph'  : 'openDialog',
    'click .title .lock'        : 'editAccessLevel',
    'click .title .published'   : 'viewPublishedDocuments',
    'click .page_icon'          : '_openEntity',
    'click .occurrence'         : '_openEntity',
    'click .cancel_search'      : '_hidePages',
    'click .search_account'     : 'searchAccount',
    'click .search_group'       : 'searchOrganization',
    'click .search_source'      : 'searchSource'
  },

  constructor : function(options) {
    Backbone.View.call(this, options);
    this.el.id = 'document_' + this.model.id;
    this.setMode(this.model.get('annotation_count') ? 'owns' : 'no', 'notes');
    _.bindAll(this, '_onDocumentChange', '_onDrop', '_addNote', '_renderNotes',
      '_renderPages', '_setSelected', 'viewDocuments', 'viewPublishedDocuments',
      'openDialog', 'openEmbed', 'viewEntities', 'deleteDocuments');
    this.model.bind('change', this._onDocumentChange);
    this.model.bind('change:selected', this._setSelected);
    this.model.notes.bind('add', this._addNote);
    this.model.notes.bind('refresh', this._renderNotes);
    this.model.pageEntities.bind('refresh', this._renderPages);
  },

  render : function() {
    var me = this;
    var title = this.model.get('title');
    var data = _.extend(this.model.toJSON(), {
      created_at    : this.model.get('created_at').replace(/\s/g, '&nbsp;'),
      icon          : this._iconAttributes(),
      thumbnail_url : this._thumbnailURL()
    });
    $(this.el).html(JST['document/tile'](data));
    this._displayDescription();
    this.$('.doc.icon').draggable({ghost : true, onDrop : this._onDrop});
    this.notesEl = this.$('.notes');
    this.pagesEl = this.$('.pages');
    this.model.notes.each(function(note){ me._addNote(note); });
    if (!this.options.noCallbacks) this.handleEvents();
    this.setMode(dc.access.NAMES[this.model.get('access')], 'access');
    this.setMode(this.model.allowedToEdit() ? 'is' : 'not', 'editable');
    this._setSelected();
    return this;
  },

  // Desktop-style selection.
  select : function(e) {
    e.preventDefault();
    if (!this.model.get('selectable')) return;
    var alreadySelected =  this.model.get('selected');
    var hk = dc.app.hotkeys;
    var anchor = Documents.firstSelection || Documents.selected()[0];
    if (hk.command || hk.control) {
      // Toggle.
      this.model.set({selected : !alreadySelected});
    } else if (hk.shift && anchor) {
      // Range.
      var idx = Documents.indexOf(this.model), aidx = Documents.indexOf(anchor);
      var start = Math.min(idx, aidx), end = Math.max(idx, aidx);
      Documents.each(function(doc, index) {
        doc.set({selected : index >= start && index <= end});
      });
    } else {
      // Regular.
      Documents.deselectAll();
      this.model.set({selected : true});
    }
  },

  viewDocument : function(e) {
    this.model.openViewer();
    return false;
  },

  viewPublishedDocuments : function() {
    var docs = Documents.chosen(this.model);
    if (!docs.length) return;
    _.each(docs, function(doc){
      if (doc.isPublished()) doc.openPublishedViewer();
    });
  },

  viewDocuments : function() {
    var docs = Documents.chosen(this.model);
    if (!docs.length) return;
    _.each(docs, function(doc){ doc.openViewer(); });
  },

  viewPDF : function() {
    this.model.openPDF();
  },

  viewFullText : function() {
    this.model.openText();
  },

  viewEntities : function() {
    dc.app.searcher.viewEntities(Documents.chosen(this.model));
  },

  downloadViewer : function() {
    if (this.checkBusy()) return;
    this.model.downloadViewer();
  },

  // Open an edit dialog for the currently selected documents, if this
  // document is among them. Otherwise, open the dialog just for this document.
  openDialog : function(e) {
    if (!(this.modes.editable == 'is')) return;
    if (this.model.checkBusy()) return;
    dc.ui.DocumentDialog.open(this.model);
  },

  openEmbed : function() {
    if (!this.model.checkAllowedToEdit(Documents.EMBED_FORBIDDEN)) return;
    (new dc.ui.PublishPreview(this.model)).render();
  },

  toggleNotes : function(e) {
    e.stopPropagation();
    var next = _.bind(function() {
      var model = Documents.get(this.model.id);
      if (this.modes.notes == 'has') return this.setMode('owns', 'notes');
      if (model.notes.length) return this.setMode('has', 'notes');
      dc.ui.spinner.show('loading notes');
      model.notes.fetch({success : function() {
        dc.ui.spinner.hide();
        window.scroll(0, $('#document_' + model.id).offset().top - 100);
      }});
    }, this);
    dc.app.paginator.mini ? dc.app.paginator.toggleSize(next, this.model) : next();
  },

  deleteDocuments : function() {
    Documents.verifyDestroy(Documents.chosen(this.model));
  },

  searchAccount : function() {
    dc.app.searcher.addToSearch('account: ' + this.model.get('account_slug'));
  },

  searchOrganization : function() {
    dc.app.searcher.addToSearch('group: ' + this.model.get('organization_slug'));
  },

  searchSource : function() {
    dc.app.searcher.addToSearch('source: "' + this.model.get('source').replace(/"/g, '\\"') + '"');
  },

  editAccessLevel : function() {
    Documents.editAccess([this.model]);
  },

  showMenu : function(e) {
    e.preventDefault();
    var menu = dc.ui.Document.sharedMenu || (dc.ui.Document.sharedMenu = new dc.ui.Menu({
      id : 'document_menu',
      standalone : true
    }));
    var count = Documents.chosen(this.model).length;
    if (!count) return;
    var deleteTitle = Inflector.pluralize('Delete Document', count);
    menu.clear();
    var items = [{title : 'Open', onClick: this.viewDocuments}];
    if (this.model.isPublished()) items.push({title : 'Open Published Version', onClick : this.viewPublishedDocuments});
    items.push({title : 'View Entities', onClick: this.viewEntities});
    if (this.model.allowedToEdit()) {
      items = items.concat([
        {title : 'Edit All Fields',         onClick: this.openDialog},
        {title : 'Embed Document Viewer',   onClick: this.openEmbed, attrs : {'class' : count > 1 ? 'disabled' : ''}},
        {title : deleteTitle,               onClick: this.deleteDocuments, attrs : {'class' : 'warn'}}
      ]);
    }
    menu.addItems(items);
    menu.render().open().content.css({top : e.pageY, left : e.pageX});
  },

  _iconAttributes : function() {
    var access = this.model.get('access');
    var base = 'icon main_icon document_tool ';
    switch (access) {
      case dc.access.PENDING:      return {'class' : base + 'spinner',    title : 'Uploading...'};
      case dc.access.ERROR:        return {'class' : base + 'alert_gray', title : 'Broken document'};
      case dc.access.ORGANIZATION: return {'class' : base + 'lock',       title : 'Private to ' + dc.account.organization.name};
      case dc.access.PRIVATE:      return {'class' : base + 'lock',       title : 'Private'};
      default:
        if (this.model.isPublished()) return {'class' : base + 'published', title : 'Open Published Version'};
        return {'class' : base + 'hidden'};
    }
  },

  _thumbnailURL : function() {
    var access = this.model.get('access');
    switch (access) {
      case dc.access.PENDING: return '/images/embed/documents/processing.png';
      case dc.access.ERROR:   return '/images/embed/documents/failed.png';
      default:                return this.model.get('thumbnail_url');
    }
  },

  // HTML descriptions need to be sanitized for the workspace.
  _displayDescription : function() {
    var el = this.$('.description_text');
    if (this.model.get('access') == dc.access.ERROR) return el.html(this.ERROR_MESSAGE);
    el.text(Inflector.stripTags(this.model.get('description') || ''));
  },

  _setSelected : function() {
    var sel = this.model.get('selected');
    this.setMode(sel ? 'is' : 'not', 'selected');
  },

  _onDocumentChange : function() {
    if (this.model.hasChanged('selected')) return;
    if (this.model.hasChanged('annotation_count')) return this.$('span.note_count').text(this.model.get('annotation_count'));
    this.render();
  },

  _addNote : function(note) {
    this.notesEl.append((new dc.ui.Note({model : note, collection : this.model.notes})).render().el);
  },

  _renderNotes : function() {
    this.model.notes.each(this._addNote);
    this.setMode('has', 'notes');
  },

  _renderPages : function() {
    this.pagesEl.html(JST['document/pages']({doc : this.model}));
  },

  _hidePages : function() {
    this.pagesEl.html('');
  },

  _openEntity : function(e) {
    var el      = $(e.target).closest('.page');
    var id      = el.attr('data-id');
    var page    = el.attr('data-page');
    var offset  = el.attr('data-offset');
    window.open(this.model.viewerUrl() + "?entity=" + id + '&page=' + page + '&offset=' + offset);
  },

  // When the document is dropped onto a project, add it to the project.
  _onDrop : function(e) {
    var docs = [this.model];
    var selected = Documents.selected();
    if (selected.length && _.include(selected, this.model)) docs = selected;
    var x = e.pageX, y = e.pageY;
    $('#organizer .project').each(function() {
      var top = $(this).offset().top, left = $(this).offset().left;
      var right = left + $(this).outerWidth(), bottom = top + $(this).outerHeight();
      if (left < x && right > x && top < y && bottom > y) {
        var project = Projects.getByCid($(this).attr('data-project-cid'));
        if (project) project.addDocuments(docs);
        return false;
      }
    });
  },

  _noSelect : function(e) {
    e.preventDefault();
  }

});