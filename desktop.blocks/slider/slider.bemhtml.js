block('slider')(
  content()(function() {
  	return applyNext().map(function(item) {
  	  return {
        elem: 'item',
        js: true,
        elemMods: { disabled: item.disabled },
        content: [{
          elem: 'title',
          elemMods: { titleTheme: item.titleTheme },
          content: item.title
        },
        {
          elem: 'text',
          elemMods: { textTheme: item.textTheme },
          content: item.text
        },
        {
          block: 'button',
          mods: { visibility: item.visibility },
          mix: { block: 'slider', elem: 'button' },
          content: item.buttonSlider1
        },
        {
          block: 'button',
          mods: { visibility: item.visibility },
          mix: { block: 'slider', elem: 'button' },
          content: item.buttonSlider2
        },
        {
          block: 'button',
          js: true,
          mods: { style: 'arrow', arrow: 'arrow-prev' }
        },
        {
          block: 'button',
          js: true,
          mods: { style: 'arrow', arrow: 'arrow-next' }
        }]
  	  };
  	});
  }),
  elem('title')(
  	tag()('h1')
  ),
  elem('title')(
  	tag()('p')
  )
);
block('slider')(
  content()(() => {
  	return {
  	  elem: 'inner',
  	  content: applyNext()
  	};
  })
);