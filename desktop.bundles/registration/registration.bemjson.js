module.exports = {
    block: 'page',
    title: 'Registration',
    favicon: '/favicon.ico',
    head: [
        { elem: 'meta', attrs: { name: 'description', content: '' } },
        { elem: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
        { elem: 'css', url: 'registration.min.css' },
        { elem: 'css', url: 'https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap'}
    ],
    scripts: [{ elem: 'js', url: 'registration.min.js' }],
    content:[ 
      require('../../desktop.blocks/navigation/navigation.bemjson.js'),
    {
      block: 'form',
      mods: { type: 'autorization'},
        content: [{
          block: 'input',
          mix: { block: 'form', elem: 'input' },
          placeholder: 'name'
        },
        {
          block: 'input',
          mix: { block: 'form', elem: 'input' },
          placeholder: 'password'
        },
        {
          block: 'input',
          mix: { block: 'form', elem: 'input' },
          placeholder: 'email address'
        },
        {
          block: 'button',
          mix: { block: 'form', elem: 'button' },
          mods: { type: 'submit' },
          content: 'Create'
        }]
    }]
};
