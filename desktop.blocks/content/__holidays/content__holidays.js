modules.define('content__item', ['i-bem-dom'], function(provide, bemDom) {
  provide(bemDom.declElem('content', 'item', {
  	onSetMod: {
  	  'js' : {
  	  	'inited' : function(){         
  	  	  this._domEvents().on('click', this._onClick);
  	  	}
  	  }
  	},
  	_onClick: function() {
  	  if(this.hasMod('status', 'active')) {
  	  	this.delMod('status');
  	  }
  	  else {
  	  	this.setMod('status', 'active');
  	  }
  	}
  }))
}
);
