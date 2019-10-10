module.exports = {
  block: 'content',
  mods: { type: 'reviews' },
  content: [{
  	block: 'text',
  	content: [{
  	  elem: 'title',
  	  content: 'HAPPY CLIENTS'
  	},
  	{
  	  elem: 'info',
  	  content: 'whar customer say about us and why love our services'
  	}]
  }, 
    require('../__reviews/content__reviews.bemjson.js')
  ]
};