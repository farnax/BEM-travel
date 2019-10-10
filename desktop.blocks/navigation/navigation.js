modules.define('navigation', ['i-bem-dom', 'button', 'input'], function(provide, bemDom, Button, Input){
  provide(bemDom.declBlock(this.name, {
    onSetMod: {
      'js' : {
        'inited' : function(modName, modVal) {
          this._buttonFind = this.findChildBlock({ block: Button, modName: 'notShow', modVal: false });

          this._domEvents(this._buttonFind).on('click', this._onClick);
          this._domEvents(this._buttonFind).on('click', this._toHideButton);
        }
      }
    },
    _onClick: function() {
      this._input = this.findChildBlock(Input).setMod('notShow', false);
    },
    _toHideButton: function() {
      this._buttonFind.setMod('notShow', true);
    }
  }));
});
