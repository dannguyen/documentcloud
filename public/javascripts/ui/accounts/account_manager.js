dc.ui.AccountManager = Backbone.View.extend({
  id: "account_manager",
  events: {},
  initialize: function(options){
    this.account = dc.account;
    this.collection = (this.collection || window.Accounts)
    dc.app.navigation.bind('tab:accounts', this.open);
  },
  
  createSubViews: function() {
    
  },
  
  render: function() {
    //var html = ""
    this.$el.html(html)
  },
  
  open: function() {
    // note needs a guard against opening
    // accounts panel when in the public workspace
    // or dc.account otherwise isn't set.
    console.log("Opened Account Manager!");
    dc.app.navigation.open('accounts');
    Backbone.history.navigate('accounts');
  }
});