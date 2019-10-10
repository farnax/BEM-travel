module.exports = {
  block: 'footer',
  content: [{  
    elem: 'item',
    elemMods: { type: 'subscribes' }
  },
  {
    elem: 'item',
    content: [{
      elem: 'title',
      content: 'Latest News'
    },
      require('./__news/footer__news.bemjson.js')
    ]
  },
  {
    elem: 'item',
    content: [{
      elem: 'title',
      content: 'Tags'
    },
      require('./__tags/footer__tags.bemjson.js')
    ]
  },
  {
    elem: 'item',
    content: [{
      elem: 'title',
      content: 'Address'
    },
    {
      elem: 'info',
      content: '220070, Vaneeva str., Minsk, Belarus'
    },
    {
      elem: 'email',
      content: 'E-mail: travel@gmail.com'
    },
      require('../social-network/social-network.bemjson.js')
    ]
  },
  {
    elem: 'line'
  },
  {
    elem: 'copyright',
    content: 'Copyright @voyage. All Right Reserved.'
  }]
}