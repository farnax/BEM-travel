modules.define('slider', ['i-bem-dom', 'button'], function(provide, bemDom, Button){
  provide(bemDom.declBlock(this.name, {
  	
  	onSetMod: {
  	  'js' : {
  	  	'inited' : function(modName, modVal) {
  	  	  this._buttonsPrev = this.findChildBlocks({ block: Button, modName: 'arrow', modVal: 'arrow-prev' });
          this._events(this._buttonsPrev).on('click', this._showPrevSlide);
  	  	  
          this._buttonsNext = this.findChildBlocks({ block: Button, modName: 'arrow', modVal: 'arrow-next' });
          this._events(this._buttonsNext).on('click', this._showNextSlide);
         
          this._items = this.findChildElems('item');
  	  	}
  	  }
  	},

    _showPrevSlide: function(){
      let indexOfShownSlide = this._hideShownSlide();

      if(indexOfShownSlide == 0) {
      	let indexOfPrevSlide = this._items.size() - 1;
      	this._showSlide(indexOfPrevSlide);
      } else {
        let indexOfPrevSlide = indexOfShownSlide - 1;
      	this._showSlide(indexOfPrevSlide);
      }
    },

    _showNextSlide: function() {
      let indexOfShownSlide = this._hideShownSlide();

      if(indexOfShownSlide == (this._items.size() - 1)) {
      	let indexOfNextSlide = 0;
      	this._showSlide(indexOfNextSlide);
      } else {
        let indexOfNextSlide = indexOfShownSlide + 1;
      	this._showSlide(indexOfNextSlide);
      }
    },

    _hideShownSlide: function(){
      let shownSlide = this._items.find((elem)=>{
        if(elem.hasMod('disabled', false)) {
        	return elem;
        }
      });
      let indexOfShownSlide = shownSlide.domElem.index();
      shownSlide.setMod('disabled', true);

      return indexOfShownSlide;
    },
    _showSlide: function(index) {
      this._items.get(index).setMod('disabled', false);
    }
  }));
});

