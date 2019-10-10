module.exports = {
  block: 'search-bar',
  js: true,
  content: {
    block: 'layout',
    content: [{
      elem: 'left',
      content: [{
        elem: 'text',
        content: [{
          elem: 'text',
          elemMods: { theme: 'sf-r' },
          content: 'FIND YOUR'
        },
        {
          elem: 'text',
          elemMods: { theme: 'sf-b' },
          content: 'HOLIDAYS'
        }]
      },
      {
        elem: 'line'
      }]      
    },
    {
      elem: 'right',
      content: 
        {
        block: 'form',
        mods: { type: 'search-bar'},
        content: [
        {
          elem: 'text',
          elemMods: { theme: 'sf-l'},
          content: 'Where'
        },
        {
          block: 'input',
          mods: { info: 'destination' },
          mix: { block: 'form', elem: 'input' },
          placeholder: 'destination'
        },
        {
          elem: 'text',
          elemMods: { theme: 'sf-l'},
          content: 'When'
        },
        {
          block: 'input',
          mods: {
            'has-calendar': true,
            theme: 'islands'
          },
        weekdays: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
        months: ['January', 'February', 'March',
        'April', 'May', 'June', 'July',
        'August', 'September', 'October',
        'November', 'December'],
        placeholder: 'select date'
        },
        {
          block: 'button',
          mix: { block: 'form', elem: 'button' },
          content: 'Search'
       }]
      }
    }]   
  }
};