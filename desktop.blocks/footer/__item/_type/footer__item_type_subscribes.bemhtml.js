block('footer').elem('item').elemMod('type', 'subscribes')(
  content()(function() {
  	return applyNext(),
  	[{
      elem: 'title',
      content: 'Newsletter'
    },
    {
      elem: 'info',
      content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    },
    {
      block: 'form',
      mix: { block: 'footer', elem: 'form' },
      content: [{
        block: 'input',
        mix: { block: 'form', elem: 'input' },
        placeholder: 'Subscribes...'
      },
      {
        block: 'button',
        mix: { block: 'form', elem: 'button' },
        content: 'GO'
      }]
    }];
  })
);