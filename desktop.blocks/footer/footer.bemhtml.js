block('footer')(
  content()(() => {
  	return {
  	  elem: 'inner',
  	  content: applyNext()
  	};
  })
);
block('footer').elem('title')({ tag: 'p' });
