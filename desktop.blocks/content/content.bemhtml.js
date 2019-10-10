block('content')(
  content()(() => {
  	return {
  	  elem: 'inner',
  	  content: applyNext()
  	};
  })
);