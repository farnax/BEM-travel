module.exports = {
  block: 'content',
  mods: { type: 'offers' },
  content: [{
    block: 'text',
    content: [{
      elem: 'title',
      content: 'SPECIAL OFFERS'
    },
    {
      elem: 'info',
  	  content: 'Best 2019 packages where people love to stay!'
    }]
  },
  require('../__offers/content__offers.bemjson.js')
  ]
}