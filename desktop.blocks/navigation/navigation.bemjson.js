module.exports = {
  block: 'navigation',
  js: true,
  content: {
    block: 'layout',
      content:[{
        elem: 'left',
        content: {
          block: 'logo',
          content: 'VOYAGE'
        }
      },
      {
        elem: 'right',
        content: [
        require('../menu/menu.bemjson.js'),
        {
          block: 'button',
          js: true,
          mix: { block: 'navigation', elem: 'button' },
          mods: { notShow: false }
        },
        {
          block: 'input',
          js: true,
          mods: { notShow: true },
          mix: { block: 'navigation', elem: 'input' },
          placeholder: 'FIND'
        }]
    }]
  }
}