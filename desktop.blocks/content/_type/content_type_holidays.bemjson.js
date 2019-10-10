module.exports = {
  block: 'content',
  mods: { type: 'holidays' },
  content: [{
    block: 'text',
    content: [{
      elem: 'title',
      elemMods: { type: 'holidays' },
      content: 'HOLIDAYS TYPE'
    },
    {
      elem: 'info',
      elemMods: { type: 'holidays' },
      content: 'get explore your dream to travel the world!'
    }]
  },
  require('../__holidays/content__holidays.bemjson.js')
  ]
}