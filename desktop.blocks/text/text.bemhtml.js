block('text').elem('title')({tag: 'h3'});
block('text').elem('info')({tag: 'p'});

block('text')(
  content()(() => {
  	return {
  	  elem: 'inner',
  	  content: applyNext()
  	};
  })
);
