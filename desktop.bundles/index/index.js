/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.2
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            getStat = function() {
                var res = {},
                    module;

                for(var name in modulesStorage) {
                    if(modulesStorage.hasOwnProperty(name)) {
                        module = modulesStorage[name];
                        (res[module.decl.state] || (res[module.decl.state] = [])).push(name);
                    }
                }

                return res;
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    onDeclResolved = function(_, error) {
                        if(error) {
                            cb(null, error);
                            return;
                        }

                        if(!--unresolvedDepsCnt) {
                            var exports = [],
                                i = 0, decl;
                            while(decl = decls[i++]) {
                                exports.push(decl.exports);
                            }
                            cb(exports);
                        }
                    },
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    decls.push(decl);

                    startDeclResolving(decl, path, onDeclResolved);
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else if(decl.state === DECL_STATES.IN_RESOLVING) {
                    curOptions.trackCircularDependencies && isDependenceCircular(decl, path)?
                        cb(null, buildCircularDependenceError(decl, path)) :
                        decl.dependents.push(cb);
                    return;
                }

                decl.dependents.push(cb);

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions,
            getStat    : getStat
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(typeof window !== 'undefined' ? window : global);

/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/i-bem-dom.js */
/**
 * @module i-bem-dom
 */

modules.define(
    'i-bem-dom',
    [
        'i-bem',
        'i-bem__internal',
        'i-bem-dom__collection',
        'i-bem-dom__events_type_dom',
        'i-bem-dom__events_type_bem',
        'inherit',
        'identify',
        'objects',
        'functions',
        'jquery',
        'dom'
    ],
    function(
        provide,
        bem,
        bemInternal,
        BemDomCollection,
        domEvents,
        bemEvents,
        inherit,
        identify,
        objects,
        functions,
        $,
        dom) {

var undef,
    /**
     * Storage for DOM elements by unique key
     * @type Object
     */
    uniqIdToDomElems = {},

    /**
     * Storage for blocks by unique key
     * @type Object
     */
    uniqIdToEntity = {},

    /**
    * Storage for DOM element's parent nodes
    * @type Object
    */
    domNodesToParents = {},

    /**
     * Storage for block parameters
     * @type Object
     */
    domElemToParams = {},

    /**
     * Storage for DOM nodes that are being destructed
     * @type Object
     */
    destructingDomNodes = {},

    entities = bem.entities,

    BEM_CLASS_NAME = 'i-bem',
    BEM_SELECTOR = '.' + BEM_CLASS_NAME,
    BEM_PARAMS_ATTR = 'data-bem',

    NAME_PATTERN = bemInternal.NAME_PATTERN,

    MOD_DELIM = bemInternal.MOD_DELIM,
    ELEM_DELIM = bemInternal.ELEM_DELIM,

    buildModPostfix = bemInternal.buildModPostfix,
    buildClassName = bemInternal.buildClassName,

    reverse = Array.prototype.reverse,
    slice = Array.prototype.slice,

    domEventManagerFactory = new domEvents.EventManagerFactory(getEntityCls),
    bemEventManagerFactory = new bemEvents.EventManagerFactory(getEntityCls),

    bemDom;

/**
 * Initializes entities on a DOM element
 * @param {jQuery} domElem DOM element
 * @param {String} uniqInitId ID of the "initialization wave"
 * @param {Object} [dropElemCacheQueue] queue of elems to be droped from cache
 */
function initEntities(domElem, uniqInitId, dropElemCacheQueue) {
    var domNode = domElem[0],
        params = getParams(domNode),
        entityName,
        splitted,
        blockName,
        elemName;

    for(entityName in params) {
        splitted = entityName.split(ELEM_DELIM);
        blockName = splitted[0];
        elemName = splitted[1];
        elemName &&
            ((dropElemCacheQueue[blockName] ||
                (dropElemCacheQueue[blockName] = {}))[elemName] = true);

        initEntity(
            entityName,
            domElem,
            processParams(params[entityName], entityName, uniqInitId));
    }
}

/**
 * Initializes a specific entity on a DOM element, or returns the existing entity if it was already created
 * @param {String} entityName Entity name
 * @param {jQuery} domElem DOM element
 * @param {Object} [params] Initialization parameters
 * @param {Boolean} [ignoreLazyInit=false] Ignore lazy initialization
 * @param {Function} [callback] Handler to call after complete initialization
 */
function initEntity(entityName, domElem, params, ignoreLazyInit, callback) {
    var domNode = domElem[0];

    if(destructingDomNodes[identify(domNode)]) return;

    params || (params = processParams(getEntityParams(domNode, entityName), entityName));

    var uniqId = params.uniqId,
        entity = uniqIdToEntity[uniqId];

    if(entity) {
        if(entity.domElem.index(domNode) < 0) {
            entity.domElem = entity.domElem.add(domElem);
            objects.extend(entity.params, params);
        }

        return entity;
    }

    uniqIdToDomElems[uniqId] = uniqIdToDomElems[uniqId]?
        uniqIdToDomElems[uniqId].add(domElem) :
        domElem;

    var parentDomNode = domNode.parentNode;
    if(!parentDomNode || parentDomNode.nodeType === 11) { // jquery doesn't unique disconnected node
        $.unique(uniqIdToDomElems[uniqId]);
    }

    var entityCls = getEntityCls(entityName);

    entityCls._processInit();

    if(ignoreLazyInit || params.lazyInit === false || !entityCls.lazyInit && !params.lazyInit) {
        ignoreLazyInit && domElem.addClass(BEM_CLASS_NAME); // add css class for preventing memory leaks in further destructing

        entity = new entityCls(uniqIdToDomElems[uniqId], params, !!ignoreLazyInit);
        delete uniqIdToDomElems[uniqId];
        callback && callback.apply(entity, slice.call(arguments, 4));
        return entity;
    }
}

function getEntityCls(entityName) {
    if(entities[entityName]) return entities[entityName];

    var splitted = entityName.split(ELEM_DELIM);
    return splitted[1]?
        bemDom.declElem(splitted[0], splitted[1], {}, { lazyInit : true }) :
        bemDom.declBlock(entityName, {}, { lazyInit : true });
}

/**
 * Processes and adds necessary entity parameters
 * @param {Object} params Initialization parameters
 * @param {String} entityName Entity name
 * @param {String} [uniqInitId] ID of the "initialization wave"
 */
function processParams(params, entityName, uniqInitId) {
    params.uniqId ||
        (params.uniqId = (params.id?
            entityName + '-id-' + params.id :
            identify()) + (uniqInitId || identify()));

    return params;
}

/**
 * Helper for searching for a DOM element using a selector inside the context, including the context itself
 * @param {jQuery} ctx Context
 * @param {String} selector CSS selector
 * @param {Boolean} [excludeSelf=false] Exclude context from search
 * @returns {jQuery}
 */
function findDomElem(ctx, selector, excludeSelf) {
    var res = ctx.find(selector);
    return excludeSelf?
       res :
       res.add(ctx.filter(selector));
}

/**
 * Returns parameters of an entity's DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function getParams(domNode) {
    var uniqId = identify(domNode);
    return domElemToParams[uniqId] ||
        (domElemToParams[uniqId] = extractParams(domNode));
}

/**
 * Returns parameters of an entity extracted from DOM node
 * @param {HTMLElement} domNode DOM node
 * @param {String} entityName
 * @returns {Object}
 */

function getEntityParams(domNode, entityName) {
    var params = getParams(domNode);
    return params[entityName] || (params[entityName] = {});
}

/**
 * Retrieves entity parameters from a DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function extractParams(domNode) {
    var attrVal = domNode.getAttribute(BEM_PARAMS_ATTR);
    return attrVal? JSON.parse(attrVal) : {};
}

/**
 * Uncouple DOM node from the entity. If this is the last node, then destroys the entity.
 * @param {BemDomEntity} entity entity
 * @param {HTMLElement} domNode DOM node
 */
function removeDomNodeFromEntity(entity, domNode) {
    if(entity.domElem.length === 1) {
        entity.delMod('js');
        delete uniqIdToEntity[entity._uniqId];
    } else {
        entity.domElem = entity.domElem.not(domNode);
    }
}

/**
 * Stores DOM node's parent nodes to the storage
 * @param {jQuery} domElem
 */
function storeDomNodeParents(domElem) {
    domElem.each(function() {
        domNodesToParents[identify(this)] = this.parentNode;
    });
}

/**
 * Clears the cache for elements in context
 * @param {jQuery} ctx
 */
function dropElemCacheForCtx(ctx, dropElemCacheQueue) {
    ctx.add(ctx.parents()).each(function(_, domNode) {
        var params = domElemToParams[identify(domNode)];

        params && objects.each(params, function(entityParams) {
            var entity = uniqIdToEntity[entityParams.uniqId];
            if(entity) {
                var elemNames = dropElemCacheQueue[entity.__self._blockName];
                elemNames && entity._dropElemCache(Object.keys(elemNames));
            }
        });
    });
}

/**
 * Build key for elem
 * @param {Function|String|Object} elem Element class or name or description elem, modName, modVal
 * @returns {Object}
 */
function buildElemKey(elem) {
    if(typeof elem === 'string') {
        elem = { elem : elem };
    } else if(functions.isFunction(elem)) {
        elem = { elem : elem.getName() };
    } else if(functions.isFunction(elem.elem)) {
        elem.elem = elem.elem.getName();
    }

    return {
        elem : elem.elem,
        mod : buildModPostfix(elem.modName, elem.modVal)
    };
}

// jscs:disable requireMultipleVarDecl

/**
 * Returns jQuery collection for provided HTML
 * @param {jQuery|String} html
 * @returns {jQuery}
 */
function getJqueryCollection(html) {
    return $(typeof html === 'string'? $.parseHTML(html, null, true) : html);
}

/**
 * Validates block to be class or specified description
 * @param {*} Block Any argument passed to find*Block as Block
 * @throws {Error} Will throw an error if the Block argument isn't correct
 */
function validateBlockParam(Block) {
    if(
        typeof Block === 'string' ||
        typeof Block === 'object' && typeof Block.block === 'string'
    ) {
        throw new Error('Block must be a class or description (block, modName, modVal) of the block to find');
    }
}

/**
 * Returns base entities for declaration
 * @param {Function} baseCls block|elem class
 * @param {String} entityName entityName
 * @param {Function|Array[Function]} [base] base block|elem + mixes
 * @returns {Array<Function>}
 */
function getEntityBase(baseCls, entityName, base) {
    base || (base = entities[entityName] || baseCls);

    Array.isArray(base) || (base = [base]);

    if(!base[0].__bemEntity) {
        base = base.slice();
        base.unshift(entities[entityName] || baseCls);
    }

    return base;
}

/**
 * @class BemDomEntity
 * @description Base mix for BEM entities that have DOM representation
 */
var BemDomEntity = inherit(/** @lends BemDomEntity.prototype */{
    /**
     * @constructor
     * @private
     * @param {jQuery} domElem DOM element that the entity is created on
     * @param {Object} params parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(domElem, params, initImmediately) {
        /**
         * DOM elements of entity
         * @member {jQuery}
         * @readonly
         */
        this.domElem = domElem;

        /**
         * Cache for elements collections
         * @member {Object}
         * @private
         */
        this._elemsCache = {};

        /**
         * Cache for elements
         * @member {Object}
         * @private
         */
        this._elemCache = {};

        /**
         * References to parent entities which found current entity ever
         * @type {Array}
         * @private
         */
        this._findBackRefs = [];

        uniqIdToEntity[params.uniqId || identify(this)] = this;

        this.__base(null, params, initImmediately);
    },

    /**
     * @abstract
     * @protected
     * @returns {Block}
     */
    _block : function() {},

    /**
     * Lazy search for elements nested in a block (caches results)
     * @protected
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {BemDomCollection}
     */
    _elems : function(Elem) {
        var key = buildElemKey(Elem),
            elemsCache = this._elemsCache[key.elem];

        if(elemsCache && key.mod in elemsCache)
            return elemsCache[key.mod];

        var res = (elemsCache || (this._elemsCache[key.elem] = {}))[key.mod] =
            this.findMixedElems(Elem).concat(this.findChildElems(Elem));

        res.forEach(function(entity) {
            entity._findBackRefs.push(this);
        }, this);

        return res;
    },

    /**
     * Lazy search for the first element nested in a block (caches results)
     * @protected
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {Elem}
     */
    _elem : function(Elem) {
        var key = buildElemKey(Elem),
            elemCache = this._elemCache[key.elem];

        // NOTE: can use this._elemsCache but it's too rare case
        if(elemCache && key.mod in elemCache)
            return elemCache[key.mod];

        var res = (elemCache || (this._elemCache[key.elem] = {}))[key.mod] =
            this.findMixedElem(Elem) || this.findChildElem(Elem);

        res && res._findBackRefs.push(this);

        return res;
    },

    /**
     * Clears the cache for elements
     * @private
     * @param {?...(Function|String|Object)} elems Nested elements names or description elem, modName, modVal
     * @returns {BemDomEntity} this
     */
    _dropElemCache : function(elems) {
        if(!arguments.length) {
            this._elemsCache = {};
            this._elemCache = {};
            return this;
        }

        (Array.isArray(elems)? elems : slice.call(arguments)).forEach(function(elem) {
            var key = buildElemKey(elem);
            if(key.mod) {
                this._elemsCache[key.elem] && delete this._elemsCache[key.elem][key.mod];
                this._elemCache[key.elem] && delete this._elemCache[key.elem][key.mod];
            } else {
                delete this._elemsCache[key.elem];
                delete this._elemCache[key.elem];
            }
        }, this);

        return this;
    },

    /**
     * Finds the first child block
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {Block}
     */
    findChildBlock : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('find', Block, true);
    },

    /**
     * Finds child blocks
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findChildBlocks : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('find', Block);
    },

    /**
     * Finds the first parent block
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {Block}
     */
    findParentBlock : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('parents', Block, true);
    },

    /**
     * Finds parent blocks
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findParentBlocks : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('parents', Block);
    },

    /**
     * Finds first mixed block
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {Block}
     */
    findMixedBlock : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('filter', Block, true);
    },

    /**
     * Finds mixed blocks
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findMixedBlocks : function(Block) {
        validateBlockParam(Block);

        return this._findEntities('filter', Block);
    },

    /**
     * Finds the first child element
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {Elem}
     */
    findChildElem : function(Elem, strictMode) {
        return strictMode?
            this._filterFindElemResults(this._findEntities('find', Elem)).get(0) :
            this._findEntities('find', Elem, true);
    },

    /**
     * Finds child elements
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findChildElems : function(Elem, strictMode) {
        var res = this._findEntities('find', Elem);

        return strictMode?
            this._filterFindElemResults(res) :
            res;
    },

    /**
     * Finds the first parent element
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {Elem}
     */
    findParentElem : function(Elem, strictMode) {
        return strictMode?
            this._filterFindElemResults(this._findEntities('parents', Elem))[0] :
            this._findEntities('parents', Elem, true);
    },

    /**
     * Finds parent elements
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findParentElems : function(Elem, strictMode) {
        var res = this._findEntities('parents', Elem);
        return strictMode? this._filterFindElemResults(res) : res;
    },

    /**
     * Finds the first mixed element
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {Elem}
     */
    findMixedElem : function(Elem) {
        return this._findEntities('filter', Elem, true);
    },

    /**
     * Finds mixed elements.
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {BemDomCollection}
     */
    findMixedElems : function(Elem) {
        return this._findEntities('filter', Elem);
    },

    /**
     * Filters results of findElem helper execution in strict mode
     * @private
     * @param {BemDomCollection} res Elements
     * @returns {BemDomCollection}
     */
    _filterFindElemResults : function(res) {
        var block = this._block();
        return res.filter(function(elem) {
            return elem._block() === block;
        });
    },

    /**
     * Finds entities
     * @private
     * @param {String} select
     * @param {Function|String|Object} entity
     * @param {Boolean} [onlyFirst=false]
     * @returns {*}
     */
    _findEntities : function(select, entity, onlyFirst) {
        var entityName = functions.isFunction(entity)?
                entity.getEntityName() :
                typeof entity === 'object'?
                    entity.block?
                        entity.block.getEntityName() :
                        typeof entity.elem === 'string'?
                            this.__self._blockName + ELEM_DELIM + entity.elem :
                            entity.elem.getEntityName() :
                    this.__self._blockName + ELEM_DELIM + entity,
            selector = '.' +
                (typeof entity === 'object'?
                    buildClassName(
                        entityName,
                        entity.modName,
                        typeof entity.modVal === 'undefined'?
                            true :
                            entity.modVal) :
                    entityName) +
                (onlyFirst? ':first' : ''),
            domElems = this.domElem[select](selector);

        if(onlyFirst) return domElems[0]?
            initEntity(entityName, domElems.eq(0), undef, true)._setInitedMod() :
            null;

        var res = [],
            uniqIds = {};

        domElems.each(function(i, domElem) {
            var block = initEntity(entityName, $(domElem), undef, true)._setInitedMod();
            if(!uniqIds[block._uniqId]) {
                uniqIds[block._uniqId] = true;
                res.push(block);
            }
        });

        return new BemDomCollection(res);
    },

    /**
     * Returns an manager to bind and unbind DOM events for particular context
     * @protected
     * @param {Function|String|Object|Elem|BemDomCollection|document|window} [ctx=this.domElem] context to bind,
     *     can be BEM-entity class, instance, collection of BEM-entities,
     *     element name or description (elem, modName, modVal), document or window
     * @returns {EventManager}
     */
    _domEvents : function(ctx) {
        return domEventManagerFactory.getEventManager(this, ctx, this.domElem);
    },

    /**
     * Returns an manager to bind and unbind BEM events for particular context
     * @protected
     * @param {Function|String|BemDomEntity|BemDomCollection|Object} [ctx=this.domElem] context to bind,
     *     can be BEM-entity class, instance, collection of BEM-entities,
     *     element name or description (elem, modName, modVal)
     * @returns {EventManager}
     */
    _events : function(ctx) {
        return bemEventManagerFactory.getEventManager(this, ctx, this.domElem);
    },

    /**
     * Executes the BEM entity's event handlers and delegated handlers
     * @protected
     * @param {String|Object|events:Event} e Event name
     * @param {Object} [data] Additional information
     * @returns {BemEntity} this
     */
    _emit : function(e, data) {
        if((typeof e === 'object' && e.modName === 'js') || this.hasMod('js', 'inited')) {
            bemEvents.emit(this, e, data);
        }

        return this;
    },

    /** @override */
    _extractModVal : function(modName) {
        var domNode = this.domElem[0],
            matches;

        domNode &&
            (matches = domNode.className
                .match(this.__self._buildModValRE(modName)));

        return matches? matches[2] || true : '';
    },

    /** @override */
    _onSetMod : function(modName, modVal, oldModVal) {
        var _self = this.__self,
            name = _self.getName();

        this._findBackRefs.forEach(function(ref) {
            oldModVal === '' || ref._dropElemCache({ elem : name, modName : modName, modVal : oldModVal });
            ref._dropElemCache(modVal === ''? name : { elem : name, modName : modName, modVal : modVal });
        });

        this.__base.apply(this, arguments);

        if(modName !== 'js' || modVal !== '') {
            var classNamePrefix = _self._buildModClassNamePrefix(modName),
                classNameRE = _self._buildModValRE(modName),
                needDel = modVal === '';

            this.domElem.each(function() {
                var className = this.className,
                    modClassName = classNamePrefix;

                modVal !== true && (modClassName += MOD_DELIM + modVal);

                (oldModVal === true?
                    classNameRE.test(className) :
                    (' ' + className).indexOf(' ' + classNamePrefix + MOD_DELIM) > -1)?
                        this.className = className.replace(
                            classNameRE,
                            (needDel? '' : '$1' + modClassName)) :
                        needDel || $(this).addClass(modClassName);
            });
        }
    },

    /** @override */
    _afterSetMod : function(modName, modVal, oldModVal) {
        var eventData = { modName : modName, modVal : modVal, oldModVal : oldModVal };
        this
            ._emit({ modName : modName, modVal : '*' }, eventData)
            ._emit({ modName : modName, modVal : modVal }, eventData);
    },

    /**
     * Checks whether an entity is in the entity
     * @param {BemDomEntity} entity entity
     * @returns {Boolean}
     */
    containsEntity : function(entity) {
        return dom.contains(this.domElem, entity.domElem);
    }

}, /** @lends BemDomEntity */{
    /** @override */
    create : function() {
        throw Error('bemDom entities can not be created otherwise than from DOM');
    },

    /** @override */
    _processInit : function(heedInit) {
        /* jshint eqeqeq: false */
        if(this.onInit && this._inited == heedInit) {
            this.__base(heedInit);

            this.onInit();

            var name = this.getName(),
                origOnInit = this.onInit;

            // allow future calls of init only in case of inheritance in other block
            this.init = function() {
                this.getName() === name && origOnInit.apply(this, arguments);
            };
        }
    },

    /**
     * Returns an manager to bind and unbind events for particular context
     * @protected
     * @param {Function|String|Object} [ctx] context to bind,
     *     can be BEM-entity class, instance, element name or description (elem, modName, modVal)
     * @returns {EventManager}
     */
    _domEvents : function(ctx) {
        return domEventManagerFactory.getEventManager(this, ctx, bemDom.scope);
    },

    /**
     * Returns an manager to bind and unbind BEM events for particular context
     * @protected
     * @param {Function|String|Object} [ctx] context to bind,
     *     can be BEM-entity class, instance, element name or description (block or elem, modName, modVal)
     * @returns {EventManager}
     */
    _events : function(ctx) {
        return bemEventManagerFactory.getEventManager(this, ctx, bemDom.scope);
    },

    /**
     * Builds a prefix for the CSS class of a DOM element of the entity, based on modifier name
     * @private
     * @param {String} modName Modifier name
     * @returns {String}
     */
    _buildModClassNamePrefix : function(modName) {
        return this.getEntityName() + MOD_DELIM + modName;
    },

    /**
     * Builds a regular expression for extracting modifier values from a DOM element of an entity
     * @private
     * @param {String} modName Modifier name
     * @returns {RegExp}
     */
    _buildModValRE : function(modName) {
        return new RegExp(
            '(\\s|^)' +
            this._buildModClassNamePrefix(modName) +
            '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?(?=\\s|$)');
    },

    /**
     * Builds a CSS class name corresponding to the entity and modifier
     * @protected
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    _buildClassName : function(modName, modVal) {
        return buildClassName(this.getEntityName(), modName, modVal);
    },

    /**
     * Builds a CSS selector corresponding to an entity and modifier
     * @protected
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    _buildSelector : function(modName, modVal) {
        return '.' + this._buildClassName(modName, modVal);
    }
});

/**
 * @class Block
 * @description Base class for creating BEM blocks that have DOM representation
 * @augments i-bem:Block
 * @exports i-bem-dom:Block
 */
var Block = inherit([bem.Block, BemDomEntity], /** @lends Block.prototype */{
    /** @override */
    _block : function() {
        return this;
    }
});

/**
 * @class Elem
 * @description Base class for creating BEM elements that have DOM representation
 * @augments i-bem:Elem
 * @exports i-bem-dom:Elem
 */
var Elem = inherit([bem.Elem, BemDomEntity], /** @lends Elem.prototype */{
    /** @override */
    _block : function() {
        return this._blockInstance || (this._blockInstance = this.findParentBlock(getEntityCls(this.__self._blockName)));
    }
});

/**
 * Returns a block on a DOM element and initializes it if necessary
 * @param {Function} BemDomEntity entity
 * @param {Object} [params] entity parameters
 * @returns {BemDomEntity|null}
 */
$.fn.bem = function(BemDomEntity, params) {
    var entity = initEntity(BemDomEntity.getEntityName(), this, params, true);
    return entity? entity._setInitedMod() : null;
};

$(function() {

bemDom = /** @exports */{
    /**
     * Scope
     * @type jQuery
     */
    scope : $('body'),

    /**
     * Document shortcut
     * @type jQuery
     */
    doc : $(document),

    /**
     * Window shortcut
     * @type jQuery
     */
    win : $(window),

    /**
     * Base bemDom block
     * @type Function
     */
    Block : Block,

    /**
     * Base bemDom element
     * @type Function
     */
    Elem : Elem,

    /**
     * @param {*} entity
     * @returns {Boolean}
     */
    isEntity : function(entity) {
        return entity instanceof Block || entity instanceof Elem;
    },

    /**
     * Declares DOM-based block and creates block class
     * @param {String|Function} blockName Block name or block class
     * @param {Function|Array[Function]} [base] base block + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Block class
     */
    declBlock : function(blockName, base, props, staticProps) {
        if(!base || (typeof base === 'object' && !Array.isArray(base))) {
            staticProps = props;
            props = base;
            base = typeof blockName === 'string'?
                entities[blockName] || Block :
                blockName;
        }

        base = getEntityBase(Block, blockName, base);

        return bem.declBlock(blockName, base, props, staticProps);
    },

    /**
     * Declares elem and creates elem class
     * @param {String} blockName Block name
     * @param {String} elemName Elem name
     * @param {Function|Array[Function]} [base] base elem + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Elem class
     */
    declElem : function(blockName, elemName, base, props, staticProps) {
        var entityName = blockName + ELEM_DELIM + elemName;

        if(!base || (typeof base === 'object' && !Array.isArray(base))) {
            staticProps = props;
            props = base;
            base = entities[entityName] || Elem;
        }

        base = getEntityBase(Elem, entityName, base);

        return bem.declElem(blockName, elemName, base, props, staticProps);
    },

    declMixin : bem.declMixin,

    /**
     * Initializes blocks on a fragment of the DOM tree
     * @param {jQuery|String} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    init : function(ctx) {
        ctx = typeof ctx === 'string'?
            $(ctx) :
            ctx || bemDom.scope;

        var dropElemCacheQueue = {},
            uniqInitId = identify();

        // NOTE: we find only js-entities, so cahced elems without js can't be dropped from cache
        findDomElem(ctx, BEM_SELECTOR).each(function() {
            initEntities($(this), uniqInitId, dropElemCacheQueue);
        });

        bem._runInitFns();

        dropElemCacheForCtx(ctx, dropElemCacheQueue);

        return ctx;
    },

    /**
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     * @param {Boolean} [destructDom=false] Remove DOM node during destruction
     * @private
     */
    _destruct : function(ctx, excludeSelf, destructDom) {
        var _ctx,
            currentDestructingDomNodes = [];

        storeDomNodeParents(_ctx = excludeSelf? ctx.children() : ctx);

        reverse.call(findDomElem(_ctx, BEM_SELECTOR)).each(function(_, domNode) {
            var params = getParams(domNode),
                domNodeId = identify(domNode);

            destructingDomNodes[domNodeId] = true;
            currentDestructingDomNodes.push(domNodeId);

            objects.each(params, function(entityParams) {
                if(entityParams.uniqId) {
                    var entity = uniqIdToEntity[entityParams.uniqId];
                    entity?
                        removeDomNodeFromEntity(entity, domNode) :
                        delete uniqIdToDomElems[entityParams.uniqId];
                }
            });
            delete domElemToParams[identify(domNode)];
        });

        // NOTE: it was moved here as jquery events aren't triggered on detached DOM elements
        destructDom &&
            (excludeSelf? ctx.empty() : ctx.remove());

        // flush parent nodes storage that has been filled above
        domNodesToParents = {};

        currentDestructingDomNodes.forEach(function(domNodeId) {
            delete destructingDomNodes[domNodeId];
        });
    },

    /**
     * Destroys blocks on a fragment of the DOM tree
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     */
    destruct : function(ctx, excludeSelf) {
        this._destruct(ctx, excludeSelf, true);
    },

    /**
     * Detaches blocks on a fragment of the DOM tree without DOM tree destruction
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     */
    detach : function(ctx, excludeSelf) {
        this._destruct(ctx, excludeSelf);
    },

    /**
     * Replaces a fragment of the DOM tree inside the context, destroying old blocks and intializing new ones
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content New content
     * @returns {jQuery} Updated root DOM node
     */
    update : function(ctx, content) {
        this.destruct(ctx, true);
        return this.init(ctx.html(content));
    },

    /**
     * Changes a fragment of the DOM tree including the context and initializes blocks.
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    replace : function(ctx, content) {
        var prev = ctx.prev(),
            parent = ctx.parent();

        content = getJqueryCollection(content);

        this.destruct(ctx);

        return this.init(prev.length?
            content.insertAfter(prev) :
            content.prependTo(parent));
    },

    /**
     * Adds a fragment of the DOM tree at the end of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    append : function(ctx, content) {
        return this.init(getJqueryCollection(content).appendTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree at the beginning of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    prepend : function(ctx, content) {
        return this.init(getJqueryCollection(content).prependTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree before the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    before : function(ctx, content) {
        return this.init(getJqueryCollection(content).insertBefore(ctx));
    },

    /**
     * Adds a fragment of the DOM tree after the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    after : function(ctx, content) {
        return this.init(getJqueryCollection(content).insertAfter(ctx));
    }
};

provide(bemDom);

});

});

(function() {

var origDefine = modules.define,
    storedDeps = []; // NOTE: see https://github.com/bem/bem-core/issues/1446

modules.define = function(name, deps, decl) {
    origDefine.apply(modules, arguments);

    if(name !== 'i-bem-dom__init' && arguments.length > 2 && ~deps.indexOf('i-bem-dom')) {
        storedDeps.push(name);
        storedDeps.length === 1 && modules.define('i-bem-dom__init', storedDeps, function(provide) {
            provide(arguments[arguments.length - 1]);
            storedDeps = [];
        });
    }
};

})();

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/i-bem-dom.js */
/* begin: ../../node_modules/bem-core/common.blocks/inherit/inherit.vanilla.js */
/**
 * @module inherit
 * @version 2.2.6
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @description This module provides some syntax sugar for "class" declarations, constructors, mixins, "super" calls and static members.
 */

(function(global) {

var noop = function() {},
    hasOwnProperty = Object.prototype.hasOwnProperty,
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            hasOwnProperty.call(obj, i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            hasOwnProperty.call(o2, i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // It's a pity ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }

    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        if((name = addList[j++]) === '__self') {
            continue;
        }
        prop = add[name];
        if(isFunction(prop) &&
                (!prop.prototype || !prop.prototype.__self) && // check to prevent wrapping of "class" functions
                (prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name]?
                        base[name] :
                        name === '__constructor'? // case of inheritance from plain function
                            res.__self.__parent :
                            noop,
                    result = function() {
                        var baseSaved = this.__base;

                        this.__base = result.__base;
                        var res = prop.apply(this, arguments);
                        this.__base = baseSaved;

                        return res;
                    };
                result.__base = baseMethod;

                return result;
            })(name, prop);
        } else {
            res[name] = prop;
        }
    }
}

function applyMixins(mixins, res) {
    var i = 1, mixin;
    while(mixin = mixins[i++]) {
        res?
            isFunction(mixin)?
                inherit.self(res, mixin.prototype, mixin) :
                inherit.self(res, mixin) :
            res = isFunction(mixin)?
                inherit(mixins[0], mixin.prototype, mixin) :
                inherit(mixins[0], mixin);
    }
    return res || mixins[0];
}

/**
* Creates class
* @exports
* @param {Function|Array} [baseClass|baseClassAndMixins] class (or class and mixins) to inherit from
* @param {Object} prototypeFields
* @param {Object} [staticFields]
* @returns {Function} class
*/
function inherit() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? applyMixins(args[0]) : args[0] : noop,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            hasBase?
                function() {
                    return base.apply(this, arguments);
                } :
                function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    res.__parent = base;

    var basePtp = base.prototype,
        resPtp = res.prototype = objCreate(basePtp);

    resPtp.__self = resPtp.constructor = res;

    props && override(basePtp, resPtp, props);
    staticProps && override(base, res, staticProps);

    return res;
}

inherit.self = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        base = withMixins? applyMixins(args[0], args[0][0]) : args[0],
        props = args[1],
        staticProps = args[2],
        basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);

    return base;
};

var defineAsGlobal = true;
/* istanbul ignore next */
if(typeof exports === 'object') {
    module.exports = inherit;
    defineAsGlobal = false;
}
/* istanbul ignore next */
if(typeof modules === 'object' && typeof modules.define === 'function') {
    modules.define('inherit', function(provide) {
        provide(inherit);
    });
    defineAsGlobal = false;
}
/* istanbul ignore next */
if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = inherit;
    });
    defineAsGlobal = false;
}
/* istanbul ignore next */
defineAsGlobal && (global.inherit = inherit);

})(this);

/* end: ../../node_modules/bem-core/common.blocks/inherit/inherit.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/jquery/jquery.js */
/**
 * @module jquery
 * @description Provide jQuery (load if it does not exist).
 */

modules.define(
    'jquery',
    ['loader_type_js', 'jquery__config'],
    function(provide, loader, cfg) {

/* global jQuery */

function doProvide(preserveGlobal) {
    /**
     * @exports
     * @type Function
     */
    provide(preserveGlobal? jQuery : jQuery.noConflict(true));
}

typeof jQuery !== 'undefined'?
    doProvide(true) :
    loader(cfg.url, doProvide);
});

/* end: ../../node_modules/bem-core/common.blocks/jquery/jquery.js */
/* begin: ../../node_modules/bem-core/common.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define('jquery__config', function(provide) {

provide(/** @exports */{
    /**
     * URL for loading jQuery if it does not exist
     * @type {String}
     */
    url : 'https://yastatic.net/jquery/3.2.1/jquery.min.js'
});

});

/* end: ../../node_modules/bem-core/common.blocks/jquery/__config/jquery__config.js */
/* begin: ../../node_modules/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define(
    'jquery__config',
    ['ua', 'objects'],
    function(provide, ua, objects, base) {

provide(
    ua.msie && parseInt(ua.version, 10) < 9?
        objects.extend(
            base,
            {
                url : 'https://yastatic.net/jquery/1.12.4/jquery.min.js'
            }) :
        base);

});

/* end: ../../node_modules/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/* begin: ../../node_modules/bem-core/desktop.blocks/ua/ua.js */
/**
 * @module ua
 * @description Detect some user agent features (works like jQuery.browser in jQuery 1.8)
 * @see http://code.jquery.com/jquery-migrate-1.1.1.js
 */

modules.define('ua', function(provide) {

var ua = navigator.userAgent.toLowerCase(),
    match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
        /(webkit)[ \/]([\w.]+)/.exec(ua) ||
        /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
        /(msie) ([\w.]+)/.exec(ua) ||
        ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
        [],
    matched = {
        browser : match[1] || '',
        version : match[2] || '0'
    },
    browser = {};

if(matched.browser) {
    browser[matched.browser] = true;
    browser.version = matched.version;
}

if(browser.chrome) {
    browser.webkit = true;
} else if(browser.webkit) {
    browser.safari = true;
}

/**
 * @exports
 * @type Object
 */
provide(browser);

});

/* end: ../../node_modules/bem-core/desktop.blocks/ua/ua.js */
/* begin: ../../node_modules/bem-core/common.blocks/objects/objects.vanilla.js */
/**
 * @module objects
 * @description A set of helpers to work with JavaScript objects
 */

modules.define('objects', function(provide) {

var hasOwnProp = Object.prototype.hasOwnProperty;

provide(/** @exports */{
    /**
     * Extends a given target by
     * @param {Object} target object to extend
     * @param {Object} source
     * @returns {Object}
     */
    extend : function(target, source) {
        (typeof target !== 'object' || target === null) && (target = {});

        for(var i = 1, len = arguments.length; i < len; i++) {
            var obj = arguments[i];
            if(obj) {
                for(var key in obj) {
                    hasOwnProp.call(obj, key) && (target[key] = obj[key]);
                }
            }
        }

        return target;
    },

    /**
     * Check whether a given object is empty (contains no enumerable properties)
     * @param {Object} obj
     * @returns {Boolean}
     */
    isEmpty : function(obj) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                return false;
            }
        }

        return true;
    },

    /**
     * Generic iterator function over object
     * @param {Object} obj object to iterate
     * @param {Function} fn callback
     * @param {Object} [ctx] callbacks's context
     */
    each : function(obj, fn, ctx) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                ctx? fn.call(ctx, obj[key], key) : fn(obj[key], key);
            }
        }
    }
});

});

/* end: ../../node_modules/bem-core/common.blocks/objects/objects.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/functions/functions.vanilla.js */
/**
 * @module functions
 * @description A set of helpers to work with JavaScript functions
 */

modules.define('functions', function(provide) {

var toStr = Object.prototype.toString;

provide(/** @exports */{
    /**
     * Checks whether a given object is function
     * @param {*} obj
     * @returns {Boolean}
     */
    isFunction : function(obj) {
        // In some browsers, typeof returns "function" for HTML <object> elements
        // (i.e., `typeof document.createElement( "object" ) === "function"`).
        // We don't want to classify *any* DOM node as a function.
        return typeof obj === 'function' && typeof obj.nodeType !== 'number';
    },

    /**
     * Empty function
     */
    noop : function() {}
});

});

/* end: ../../node_modules/bem-core/common.blocks/functions/functions.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/dom/dom.js */
/**
 * @module dom
 * @description some DOM utils
 */

modules.define('dom', ['jquery'], function(provide, $) {

var EDITABLE_INPUT_TYPES = {
    'datetime-local' : true,
    date : true,
    month : true,
    number : true,
    password : true,
    search : true,
    tel : true,
    text : true,
    time : true,
    url : true,
    week : true
};

provide(/** @exports */{
    /**
     * Checks whether a DOM elem is in a context
     * @param {jQuery} ctx DOM elem where check is being performed
     * @param {jQuery} domElem DOM elem to check
     * @returns {Boolean}
     */
    contains : function(ctx, domElem) {
        var res = false;

        domElem.each(function() {
            var domNode = this;
            do {
                if(~ctx.index(domNode)) return !(res = true);
            } while(domNode = domNode.parentNode);

            return res;
        });

        return res;
    },

    /**
     * Returns current focused DOM elem in document
     * @returns {jQuery}
     */
    getFocused : function() {
        // "Error: Unspecified error." in iframe in IE9
        try { return $(document.activeElement); } catch(e) {}
    },

    /**
     * Checks whether a DOM element contains focus
     * @param {jQuery} domElem
     * @returns {Boolean}
     */
    containsFocus : function(domElem) {
        return this.contains(domElem, this.getFocused());
    },

    /**
    * Checks whether a browser currently can set focus on DOM elem
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isFocusable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;
        if(domNode.hasAttribute('tabindex')) return true;

        switch(domNode.tagName.toLowerCase()) {
            case 'iframe':
                return true;

            case 'input':
            case 'button':
            case 'textarea':
            case 'select':
                return !domNode.disabled;

            case 'a':
                return !!domNode.href;
        }

        return false;
    },

    /**
    * Checks whether a domElem is intended to edit text
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isEditable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;

        switch(domNode.tagName.toLowerCase()) {
            case 'input':
                return EDITABLE_INPUT_TYPES.hasOwnProperty(domNode.type) && !domNode.disabled && !domNode.readOnly;

            case 'textarea':
                return !domNode.disabled && !domNode.readOnly;

            default:
                return domNode.contentEditable === 'true';
        }
    }
});

});

/* end: ../../node_modules/bem-core/common.blocks/dom/dom.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__init/i-bem-dom__init.js */
/**
 * @module i-bem-dom__init
 */

modules.define('i-bem-dom__init', ['i-bem-dom'], function(provide, bemDom) {

provide(
    /**
     * Initializes blocks on a fragment of the DOM tree
     * @exports
     * @param {jQuery} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    function(ctx) {
        return bemDom.init(ctx);
    });
});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__init/i-bem-dom__init.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/**
 * @module i-bem
 */

modules.define(
    'i-bem',
    [
        'i-bem__internal',
        'inherit',
        'identify',
        'next-tick',
        'objects',
        'functions'
    ],
    function(
        provide,
        bemInternal,
        inherit,
        identify,
        nextTick,
        objects,
        functions) {

var undef,

    ELEM_DELIM = bemInternal.ELEM_DELIM,

    /**
     * Storage for block init functions
     * @private
     * @type Array
     */
    initFns = [],

    /**
     * Storage for block declarations (hash by block name)
     * @private
     * @type Object
     */
    entities = {};

/**
 * Builds the name of the handler method for setting a modifier
 * @param {String} prefix
 * @param {String} modName Modifier name
 * @param {String} modVal Modifier value
 * @returns {String}
 */
function buildModFnName(prefix, modName, modVal) {
    return '__' + prefix +
       '__mod' +
       (modName? '_' + modName : '') +
       (modVal? '_' + modVal : '');
}

/**
 * Builds the function for the handler method for setting a modifier
 * for special syntax
 * @param {String} modVal Declared modifier value
 * @param {Function} curModFn Declared modifier handler
 * @param {Function} [prevModFn] Previous handler
 * @param {Function} [condition] Condition function
 * (called with declared, set and previous modifier values)
 * @returns {Function}
 */
function buildSpecialModFn(modVal, curModFn, prevModFn, condition) {
    return prevModFn || condition?
        function(_modName, _modVal, _prevModVal) {
            var res1, res2;
            prevModFn &&
                (res1 = prevModFn.apply(this, arguments) === false);
            (condition? condition(modVal, _modVal, _prevModVal) : true) &&
                (res2 = curModFn.apply(this, arguments) === false);
            if(res1 || res2) return false;
        } :
        curModFn;
}

var specialModConditions = {
    '!' : function(modVal, _modVal, _prevModVal) {
        return _modVal !== modVal;
    },
    '~' : function(modVal, _modVal, _prevModVal) {
        return _prevModVal === modVal;
    }
};

/**
 * Transforms a hash of modifier handlers to methods
 * @param {String} prefix
 * @param {Object} modFns
 * @param {Object} props
 */
function modFnsToProps(prefix, modFns, props) {
    if(functions.isFunction(modFns)) {
        props[buildModFnName(prefix, '*', '*')] = modFns;
    } else {
        var modName, modVal, modFn;
        for(modName in modFns) {
            modFn = modFns[modName];
            if(functions.isFunction(modFn)) {
                props[buildModFnName(prefix, modName, '*')] = modFn;
            } else {
                var starModFnName = buildModFnName(prefix, modName, '*');
                for(modVal in modFn) {
                    var curModFn = modFn[modVal],
                        modValPrefix = modVal[0];

                    if(modValPrefix === '!' || modValPrefix === '~' || modVal === '*') {
                        modVal === '*' || (modVal = modVal.substr(1));
                        props[starModFnName] = buildSpecialModFn(
                            modVal,
                            curModFn,
                            props[starModFnName],
                            specialModConditions[modValPrefix]);
                    } else {
                        props[buildModFnName(prefix, modName, modVal)] = curModFn;
                    }
                }
            }
        }
    }
}

function buildCheckMod(modName, modVal) {
    return modVal?
        Array.isArray(modVal)?
            function(block) {
                var i = 0, len = modVal.length;
                while(i < len)
                    if(checkMod(block, modName, modVal[i++]))
                        return true;
                return false;
            } :
            function(block) {
                return checkMod(block, modName, modVal);
            } :
        function(block) {
            return checkMod(block, modName, true);
        };
}

function checkMod(block, modName, modVal) {
    var prevModVal = block._processingMods[modName];

    // check if a block has either current or previous modifier value equal to passed modVal
    return modVal === '*'?
        /* jshint eqnull: true */
        block.hasMod(modName) || prevModVal != null :
        block.hasMod(modName, modVal) || prevModVal === modVal;
}

function convertModHandlersToMethods(props) {
    if(props.beforeSetMod) {
        modFnsToProps('before', props.beforeSetMod, props);
        delete props.beforeSetMod;
    }

    if(props.onSetMod) {
        modFnsToProps('after', props.onSetMod, props);
        delete props.onSetMod;
    }
}

function declEntity(baseCls, entityName, base, props, staticProps) {
    base || (base = entities[entityName] || baseCls);

    Array.isArray(base) || (base = [base]);

    if(!base[0].__bemEntity) {
        base = base.slice();
        base.unshift(entities[entityName] || baseCls);
    }

    props && convertModHandlersToMethods(props);

    var entityCls;

    entityName === base[0].getEntityName()?
        // makes a new "init" if the old one was already executed
        (entityCls = inherit.self(base, props, staticProps))._processInit(true) :
        (entityCls = entities[entityName] = inherit(base, props, staticProps));

    return entityCls;
}

// jscs:disable requireMultipleVarDecl

/**
 * @class BemEntity
 * @description Base block for creating BEM blocks
 */
var BemEntity = inherit(/** @lends BemEntity.prototype */ {
    /**
     * @constructor
     * @private
     * @param {Object} mods BemEntity modifiers
     * @param {Object} params BemEntity parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(mods, params, initImmediately) {
        /**
         * Cache of modifiers
         * @member {Object}
         * @private
         */
        this._modCache = mods || {};

        /**
         * Current modifiers in the stack
         * @member {Object}
         * @private
         */
        this._processingMods = {};

        /**
         * BemEntity parameters, taking into account the defaults
         * @member {Object}
         * @readonly
         */
        this.params = objects.extend(this._getDefaultParams(), params);

        /**
         * @member {String} Unique entity ID
         * @private
         */
        this._uniqId = this.params.uniqId || identify(this);

        initImmediately !== false?
            this._setInitedMod() :
            initFns.push(this._setInitedMod, this);
    },

    /**
     * Initializes a BEM entity
     * @private
     */
    _setInitedMod : function() {
        return this.setMod('js', 'inited');
    },

    /**
     * Checks whether a BEM entity has a modifier
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {Boolean}
     */
    hasMod : function(modName, modVal) {
        var typeModVal = typeof modVal;
        typeModVal === 'undefined' || typeModVal === 'boolean' || (modVal = modVal.toString());

        var res = this.getMod(modName) === (modVal || '');
        return arguments.length === 1? !res : res;
    },

    /**
     * Returns the value of the modifier of the BEM entity
     * @param {String} modName Modifier name
     * @returns {String} Modifier value
     */
    getMod : function(modName) {
        var modCache = this._modCache;
        return modName in modCache?
            modCache[modName] || '' :
            modCache[modName] = this._extractModVal(modName);
    },

    /**
     * Sets the modifier for a BEM entity
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal=true] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {BemEntity} this
     */
    setMod : function(modName, modVal) {
        var typeModVal = typeof modVal;
        if(typeModVal === 'undefined') {
            modVal = true;
        } else if(typeModVal === 'boolean') {
            modVal === false && (modVal = '');
        } else {
            modVal = modVal.toString();
        }

        /* jshint eqnull: true */
        if(this._processingMods[modName] != null) return this;

        var curModVal = this.getMod(modName);
        if(curModVal === modVal) return this;

        this._processingMods[modName] = curModVal;

        var needSetMod = true,
            modFnParams = [modName, modVal, curModVal],
            modVars = [['*', '*'], [modName, '*'], [modName, modVal]],
            prefixes = ['before', 'after'],
            i = 0, prefix, j, modVar;

        while(prefix = prefixes[i++]) {
            j = 0;
            while(modVar = modVars[j++]) {
                if(this._callModFn(prefix, modVar[0], modVar[1], modFnParams) === false) {
                    needSetMod = false;
                    break;
                }
            }

            if(!needSetMod) break;

            if(prefix === 'before') {
                this._modCache[modName] = modVal;
                this._onSetMod(modName, modVal, curModVal);
            }
        }

        this._processingMods[modName] = null;
        needSetMod && this._afterSetMod(modName, modVal, curModVal);

        return this;
    },

    /**
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     */
    _onSetMod : function(modName, modVal, oldModVal) {},

    /**
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     */
    _afterSetMod : function(modName, modVal, oldModVal) {},

    /**
     * Sets a modifier for a BEM entity, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @param {String} modName Modifier name
     * @param {String} [modVal1=true] First modifier value, optional for boolean modifiers
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {BemEntity} this
     */
    toggleMod : function(modName, modVal1, modVal2, condition) {
        typeof modVal1 === 'undefined' && (modVal1 = true); // boolean mod

        if(typeof modVal2 === 'undefined') {
            modVal2 = '';
        } else if(typeof modVal2 === 'boolean') {
            condition = modVal2;
            modVal2 = '';
        }

        var modVal = this.getMod(modName);
        (modVal === modVal1 || modVal === modVal2) &&
            this.setMod(
                modName,
                typeof condition === 'boolean'?
                    (condition? modVal1 : modVal2) :
                    this.hasMod(modName, modVal1)? modVal2 : modVal1);

        return this;
    },

    /**
     * Removes a modifier from a BEM entity
     * @param {String} modName Modifier name
     * @returns {BemEntity} this
     */
    delMod : function(modName) {
        return this.setMod(modName, '');
    },

    /**
     * Executes handlers for setting modifiers
     * @private
     * @param {String} prefix
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {Array} modFnParams Handler parameters
     */
    _callModFn : function(prefix, modName, modVal, modFnParams) {
        var modFnName = buildModFnName(prefix, modName, modVal);
        return this[modFnName]?
           this[modFnName].apply(this, modFnParams) :
           undef;
    },

    _extractModVal : function(modName) {
        return '';
    },

    /**
     * Returns a BEM entity's default parameters
     * @protected
     * @returns {Object}
     */
    _getDefaultParams : function() {
        return {};
    },

    /**
     * Executes given callback on next turn eventloop in BEM entity's context
     * @protected
     * @param {Function} fn callback
     * @returns {BemEntity} this
     */
    _nextTick : function(fn) {
        var _this = this;
        nextTick(function() {
            _this.hasMod('js', 'inited') && fn.call(_this);
        });
        return this;
    }
}, /** @lends BemEntity */{
    /**
     * Factory method for creating an instance
     * @param {Object} mods modifiers
     * @param {Object} params params
     * @returns {BemEntity}
     */
    create : function(mods, params) {
        return new this(mods, params);
    },

    /**
     * Declares modifier
     * @param {Object} mod
     * @param {String} mod.modName
     * @param {String|Boolean|Array} [mod.modVal]
     * @param {Object} props
     * @param {Object} [staticProps]
     * @returns {Function}
     */
    declMod : function(mod, props, staticProps) {
        props && convertModHandlersToMethods(props);

        var checkMod = buildCheckMod(mod.modName, mod.modVal),
            basePtp = this.prototype;

        objects.each(props, function(prop, name) {
            functions.isFunction(prop) &&
                (props[name] = function() {
                    var method;
                    if(checkMod(this)) {
                        method = prop;
                    } else {
                        var baseMethod = basePtp[name];
                        baseMethod && baseMethod !== prop &&
                            (method = this.__base);
                    }
                    return method?
                        method.apply(this, arguments) :
                        undef;
                });
        });

        return inherit.self(this, props, staticProps);
    },

    __bemEntity : true,

    _name : null,

    /**
     * Processes a BEM entity's init
     * @private
     * @param {Boolean} [heedInit=false] Whether to take into account that the BEM entity already processed its init property
     */
    _processInit : function(heedInit) {
        this._inited = true;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getName : function() {
        return this._name;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getEntityName : function() {
        return this._name;
    }
});

/**
 * @class Block
 * @description Class for creating BEM blocks
 * @augments BemEntity
 */
var Block = BemEntity;

/**
 * @class Elem
 * @description Class for creating BEM elems
 * @augments BemEntity
 */
var Elem = inherit(BemEntity, /** @lends Elem.prototype */ {
    /**
     * Returns the own block of current element
     * @protected
     * @returns {Block}
     */
    _block : function() {
        return this._blockInstance;
    }
}, /** @lends Elem */{
    /**
     * Factory method for creating an instance
     * @param {Object} block block instance
     * @param {Object} mods modifiers
     * @param {Object} params params
     * @returns {BemEntity}
     */
    create : function(block, mods, params) {
        var res = new this(mods, params);
        res._blockInstance = block;
        return res;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getEntityName : function() {
        return this._blockName + ELEM_DELIM + this._name;
    }
});

provide(/** @exports */{
    /**
     * Block class
     * @type Function
     */
    Block : Block,

    /**
     * Elem class
     * @type Function
     */
    Elem : Elem,

    /**
     * Storage for block declarations (hash by block name)
     * @type Object
     */
    entities : entities,

    /**
     * Declares block and creates a block class
     * @param {String|Function} blockName Block name or block class
     * @param {Function|Array[Function]} [base] base block + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Block class
     */
    declBlock : function(blockName, base, props, staticProps) {
        if(typeof base === 'object' && !Array.isArray(base)) {
            staticProps = props;
            props = base;
            base = undef;
        }

        var baseCls = Block;
        if(typeof blockName !== 'string') {
            baseCls = blockName;
            blockName = blockName.getEntityName();
        }

        var res = declEntity(baseCls, blockName, base, props, staticProps);
        res._name = res._blockName = blockName;
        return res;
    },

    /**
     * Declares elem and creates an elem class
     * @param {String} [blockName] Block name
     * @param {String|Function} elemName Elem name or elem class
     * @param {Function|Function[]} [base] base elem + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Elem class
     */
    declElem : function(blockName, elemName, base, props, staticProps) {
        var baseCls = Elem,
            entityName;

        if(typeof blockName !== 'string') {
            staticProps = props;
            props = base;
            base = elemName;
            elemName = blockName._name;
            baseCls = blockName;
            blockName = baseCls._blockName;
            entityName = baseCls.getEntityName();
        } else {
            entityName = blockName + ELEM_DELIM + elemName;
        }

        if(typeof base === 'object' && !Array.isArray(base)) {
            staticProps = props;
            props = base;
            base = undef;
        }

        var res = declEntity(baseCls, entityName, base, props, staticProps);
        res._blockName = blockName;
        res._name = elemName;
        return res;
    },

    /**
     * Declares mixin
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} mix
     */
    declMixin : function(props, staticProps) {
        convertModHandlersToMethods(props || (props = {}));
        return inherit(props, staticProps);
    },

    /**
     * Executes the block init functions
     * @private
     */
    _runInitFns : function() {
        if(initFns.length) {
            var fns = initFns,
                fn, i = 0;

            initFns = [];
            while(fn = fns[i]) {
                fn.call(fns[i + 1]);
                i += 2;
            }
        }
    }
});

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/**
 * @module i-bem__internal
 */

modules.define('i-bem__internal', function(provide) {

var undef,
    /**
     * Separator for modifiers and their values
     * @const
     * @type String
     */
    MOD_DELIM = '_',

    /**
     * Separator between names of a block and a nested element
     * @const
     * @type String
     */
    ELEM_DELIM = '__',

    /**
     * Pattern for acceptable element and modifier names
     * @const
     * @type String
     */
    NAME_PATTERN = '[a-zA-Z0-9-]+';

function isSimple(obj) {
    var typeOf = typeof obj;
    return typeOf === 'string' || typeOf === 'number' || typeOf === 'boolean';
}

function buildModPostfix(modName, modVal) {
    var res = '';
    /* jshint eqnull: true */
    if(modVal != null && modVal !== false) {
        res += MOD_DELIM + modName;
        modVal !== true && (res += MOD_DELIM + modVal);
    }
    return res;
}

function buildBlockClassName(name, modName, modVal) {
    return name + buildModPostfix(modName, modVal);
}

function buildElemClassName(block, name, modName, modVal) {
    return buildBlockClassName(block, undef, undef) +
        ELEM_DELIM + name +
        buildModPostfix(modName, modVal);
}

provide(/** @exports */{
    NAME_PATTERN : NAME_PATTERN,

    MOD_DELIM : MOD_DELIM,
    ELEM_DELIM : ELEM_DELIM,

    buildModPostfix : buildModPostfix,

    /**
     * Builds the class name of a block or element with a modifier
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String|Number} [modVal] Modifier value
     * @returns {String} Class name
     */
    buildClassName : function(block, elem, modName, modVal) {
        if(isSimple(modName)) {
            if(!isSimple(modVal)) {
                modVal = modName;
                modName = elem;
                elem = undef;
            }
        } else if(typeof modName !== 'undefined') {
            modName = undef;
        } else if(elem && typeof elem !== 'string') {
            elem = undef;
        }

        if(!(elem || modName)) { // optimization for simple case
            return block;
        }

        return elem?
            buildElemClassName(block, elem, modName, modVal) :
            buildBlockClassName(block, modName, modVal);
    },

    /**
     * Builds full class names for a buffer or element with modifiers
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifiers
     * @returns {String} Class
     */
    buildClassNames : function(block, elem, mods) {
        if(elem && typeof elem !== 'string') {
            mods = elem;
            elem = undef;
        }

        var res = elem?
            buildElemClassName(block, elem, undef, undef) :
            buildBlockClassName(block, undef, undef);

        if(mods) {
            for(var modName in mods) {
                if(mods.hasOwnProperty(modName) && mods[modName]) {
                    res += ' ' + (elem?
                        buildElemClassName(block, elem, modName, mods[modName]) :
                        buildBlockClassName(block, modName, mods[modName]));
                }
            }
        }

        return res;
    }
});

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/identify/identify.vanilla.js */
/**
 * @module identify
 */

modules.define('identify', function(provide) {

var counter = 0,
    expando = '__' + (+new Date),
    global = this.global,
    get = function() {
        return 'uniq' + (++counter);
    },
    identify = function(obj) {
        if((typeof obj === 'object' && obj !== null) || typeof obj === 'function') {
            var key;
            if('uniqueID' in obj) {
                obj === global.document && (obj = obj.documentElement);
                key = 'uniqueID';
            } else {
                key = expando;
            }
            return key in obj?
                obj[key] :
                obj[key] = get();
        }

        return '';
    };

provide(
    /**
     * Makes unique ID
     * @exports
     * @param {?...Object} obj Object that needs to be identified
     * @returns {String} ID
     */
    function(obj) {
        if(arguments.length) {
            if(arguments.length === 1) {
                return identify(obj);
            }

            var res = [];
            for(var i = 0, len = arguments.length; i < len; i++) {
                res.push(identify(arguments[i]));
            }
            return res.sort().join('');
        }

        return get();
    }
);

});

/* end: ../../node_modules/bem-core/common.blocks/identify/identify.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/**
 * @module next-tick
 */

modules.define('next-tick', function(provide) {

/**
 * Executes given function on next tick.
 * @exports
 * @type Function
 * @param {Function} fn
 */

var global = this.global,
    fns = [],
    enqueueFn = function(fn) {
        fns.push(fn);
        return fns.length === 1;
    },
    callFns = function() {
        var fnsToCall = fns, i = 0, len = fns.length;
        fns = [];
        while(i < len) {
            fnsToCall[i++]();
        }
    };

    /* global process */
    if(typeof process === 'object' && process.nextTick) { // nodejs
        return provide(function(fn) {
            enqueueFn(fn) && process.nextTick(callFns);
        });
    }

    if(global.setImmediate) { // ie10
        return provide(function(fn) {
            enqueueFn(fn) && global.setImmediate(callFns);
        });
    }

    if(global.postMessage) { // modern browsers
        var isPostMessageAsync = true;
        if(global.attachEvent) {
            var checkAsync = function() {
                    isPostMessageAsync = false;
                };
            global.attachEvent('onmessage', checkAsync);
            global.postMessage('__checkAsync', '*');
            global.detachEvent('onmessage', checkAsync);
        }

        if(isPostMessageAsync) {
            var msg = '__nextTick' + (+new Date),
                onMessage = function(e) {
                    if(e.data === msg) {
                        e.stopPropagation && e.stopPropagation();
                        callFns();
                    }
                };

            global.addEventListener?
                global.addEventListener('message', onMessage, true) :
                global.attachEvent('onmessage', onMessage);

            return provide(function(fn) {
                enqueueFn(fn) && global.postMessage(msg, '*');
            });
        }
    }

    var doc = global.document;
    if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
        var head = doc.getElementsByTagName('head')[0],
            createScript = function() {
                var script = doc.createElement('script');
                script.onreadystatechange = function() {
                    script.parentNode.removeChild(script);
                    script = script.onreadystatechange = null;
                    callFns();
                };
                head.appendChild(script);
            };

        return provide(function(fn) {
            enqueueFn(fn) && createScript();
        });
    }

    provide(function(fn) { // old browsers
        enqueueFn(fn) && global.setTimeout(callFns, 0);
    });
});

/* end: ../../node_modules/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/i-bem-dom__events.js */
/**
 * @module i-bem-dom__events
 */
modules.define(
    'i-bem-dom__events',
    [
        'i-bem__internal',
        'i-bem-dom__collection',
        'inherit',
        'identify',
        'objects',
        'jquery',
        'functions'
    ],
    function(
        provide,
        bemInternal,
        BemDomCollection,
        inherit,
        identify,
        objects,
        $,
        functions) {

var undef,
    winNode = window,
    docNode = document,
    winId = identify(winNode),
    docId = identify(docNode),
    eventStorage = {},

    /**
     * @class EventManager
     */
    EventManager = inherit(/** @lends EventManager.prototype */{
        /**
         * @constructor
         * @param {Object} params EventManager parameters
         * @param {Function} fnWrapper Wrapper function to build event handler
         * @param {Function} eventBuilder Function to build event
         */
        __constructor : function(params, fnWrapper, eventBuilder) {
            this._params = params;
            this._fnWrapper = fnWrapper;
            this._eventBuilder = eventBuilder;
            this._storage = {};
        },

        /**
         * Adds an event handler
         * @param {String|Object|events:Event} e Event type
         * @param {*} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @returns {EventManager} this
         */
        on : function(e, data, fn, _fnCtx, _isOnce) {
            var params = this._params,
                event = this._eventBuilder(e, params);

            if(functions.isFunction(data)) {
                _isOnce = _fnCtx;
                _fnCtx = fn;
                fn = data;
                data = undef;
            }

            var fnStorage = this._storage[event] || (this._storage[event] = {}),
                fnId = identify(fn, _fnCtx);

            if(!fnStorage[fnId]) {
                var bindDomElem = params.bindDomElem,
                    bindSelector = params.bindSelector,
                    _this = this,
                    handler = fnStorage[fnId] = this._fnWrapper(
                        _isOnce?
                            function() {
                                _this.un(e, fn, _fnCtx);
                                fn.apply(this, arguments);
                            } :
                            fn,
                        _fnCtx,
                        fnId);

                bindDomElem.on(event, bindSelector, data, handler);
                bindSelector && bindDomElem.is(bindSelector) && bindDomElem.on(event, data, handler);
                // FIXME: "once" won't properly work in case of nested and mixed elem with the same name
            }

            return this;
        },

        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {*} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @returns {EventManager} this
         */
        once : function(e, data, fn, _fnCtx) {
            if(functions.isFunction(data)) {
                _fnCtx = fn;
                fn = data;
                data = undef;
            }

            return this.on(e, data, fn, _fnCtx, true);
        },

        /**
         * Removes event handler or handlers
         * @param {String|Object|events:Event} [e] Event type
         * @param {Function} [fn] Handler
         * @returns {EventManager} this
         */
        un : function(e, fn, _fnCtx) {
            var argsLen = arguments.length;
            if(argsLen) {
                var params = this._params,
                    event = this._eventBuilder(e, params);

                if(argsLen === 1) {
                    this._unbindByEvent(this._storage[event], event);
                } else {
                    var wrappedFn,
                        fnId = identify(fn, _fnCtx),
                        fnStorage = this._storage[event],
                        bindDomElem = params.bindDomElem,
                        bindSelector = params.bindSelector;

                    if(wrappedFn = fnStorage && fnStorage[fnId])
                        delete fnStorage[fnId];

                    var handler = wrappedFn || fn;

                    bindDomElem.off(event, params.bindSelector, handler);
                    bindSelector && bindDomElem.is(bindSelector) && bindDomElem.off(event, handler);
                }
            } else {
                objects.each(this._storage, this._unbindByEvent, this);
            }

            return this;
        },

        _unbindByEvent : function(fnStorage, e) {
            var params = this._params,
                bindDomElem = params.bindDomElem,
                bindSelector = params.bindSelector,
                unbindWithoutSelector = bindSelector && bindDomElem.is(bindSelector);

            fnStorage && objects.each(fnStorage, function(fn) {
                bindDomElem.off(e, bindSelector, fn);
                unbindWithoutSelector && bindDomElem.off(e, fn);
            });
            this._storage[e] = null;
        }
    }),
    buildForEachEventManagerProxyFn = function(methodName) {
        return function() {
            var args = arguments;

            this._eventManagers.forEach(function(eventManager) {
                eventManager[methodName].apply(eventManager, args);
            });

            return this;
        };
    },
    /**
     * @class CollectionEventManager
     */
    CollectionEventManager = inherit(/** @lends CollectionEventManager.prototype */{
        /**
         * @constructor
         * @param {Array} eventManagers Array of event managers
         */
        __constructor : function(eventManagers) {
            this._eventManagers = eventManagers;
        },

        /**
         * Adds an event handler
         * @param {String|Object|events:Event} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @returns {CollectionEventManager} this
         */
        on : buildForEachEventManagerProxyFn('on'),

        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @returns {CollectionEventManager} this
         */
        once : buildForEachEventManagerProxyFn('once'),

        /**
         * Removes event handler or handlers
         * @param {String|Object|events:Event} [e] Event type
         * @param {Function} [fn] Handler
         * @returns {CollectionEventManager} this
         */
        un : buildForEachEventManagerProxyFn('un')
    }),
    /**
     * @class EventManagerFactory
     * @exports i-bem-dom__events:EventManagerFactory
     */
    EventManagerFactory = inherit(/** @lends EventManagerFactory.prototype */{
        __constructor : function(getEntityCls) {
            this._storageSuffix = identify();
            this._getEntityCls = getEntityCls;
            this._eventManagerCls = EventManager;
        },

        /**
         * Instantiates event manager
         * @param {Function|i-bem-dom:BemDomEntity} ctx BemDomEntity class or instance
         * @param {*} bindCtx context to bind
         * @param {jQuery} bindScope bind scope
         * @returns {EventManager}
         */
        getEventManager : function(ctx, bindCtx, bindScope) {
            if(bindCtx instanceof BemDomCollection) {
                return new CollectionEventManager(bindCtx.map(function(entity) {
                    return this.getEventManager(ctx, entity, bindScope);
                }, this));
            }

            var ctxId = identify(ctx),
                ctxStorage = eventStorage[ctxId],
                storageSuffix = this._storageSuffix,
                isBindToInstance = typeof ctx !== 'function',
                ctxCls,
                selector = '';

            if(isBindToInstance) {
                ctxCls = ctx.__self;
            } else {
                ctxCls = ctx;
                selector = ctx._buildSelector();
            }

            var params = this._buildEventManagerParams(bindCtx, bindScope, selector, ctxCls),
                storageKey = params.key + storageSuffix;

            if(!ctxStorage) {
                ctxStorage = eventStorage[ctxId] = {};
                if(isBindToInstance) {
                    ctx._events().on({ modName : 'js', modVal : '' }, function() {
                        params.bindToArbitraryDomElem && ctxStorage[storageKey] &&
                            ctxStorage[storageKey].un();
                        delete ctxStorage[ctxId];
                    });
                }
            }

            return ctxStorage[storageKey] ||
                (ctxStorage[storageKey] = this._createEventManager(ctx, params, isBindToInstance));
        },

        _buildEventManagerParams : function(bindCtx, bindScope, ctxSelector, ctxCls) {
            var res = {
                bindEntityCls : null,
                bindDomElem : bindScope,
                bindToArbitraryDomElem : false,
                bindSelector : ctxSelector,
                ctxSelector : ctxSelector,
                key : ''
            };

            if(bindCtx) {
                var typeOfCtx = typeof bindCtx;

                if(bindCtx.jquery) {
                    res.bindDomElem = bindCtx;
                    res.key = identify.apply(null, bindCtx.get());
                    res.bindToArbitraryDomElem = true;
                } else if(bindCtx === winNode || bindCtx === docNode || (typeOfCtx === 'object' && bindCtx.nodeType === 1)) { // NOTE: duck-typing check for "is-DOM-element"
                    res.bindDomElem = $(bindCtx);
                    res.key = identify(bindCtx);
                    res.bindToArbitraryDomElem = true;
                } else if(typeOfCtx === 'object' && bindCtx.__self) { // bem entity instance
                    res.bindDomElem = bindCtx.domElem;
                    res.key = bindCtx._uniqId;
                    res.bindEntityCls = bindCtx.__self;
                } else if(typeOfCtx === 'string' || typeOfCtx === 'object' || typeOfCtx === 'function') {
                    var blockName, elemName, modName, modVal;
                    if(typeOfCtx === 'string') { // elem name
                        blockName = ctxCls._blockName;
                        elemName = bindCtx;
                    } else if(typeOfCtx === 'object') { // bem entity with optional mod val
                        blockName = bindCtx.block?
                            bindCtx.block.getName() :
                            ctxCls._blockName;
                        elemName = typeof bindCtx.elem === 'function'?
                            bindCtx.elem.getName() :
                            bindCtx.elem;
                        modName = bindCtx.modName;
                        modVal = bindCtx.modVal;
                    } else if(bindCtx.getName() === bindCtx.getEntityName()) { // block class
                        blockName = bindCtx.getName();
                    } else { // elem class
                        blockName = ctxCls._blockName;
                        elemName = bindCtx.getName();
                    }

                    var entityName = bemInternal.buildClassName(blockName, elemName);
                    res.bindEntityCls = this._getEntityCls(entityName);
                    res.bindSelector = '.' + (res.key = entityName + bemInternal.buildModPostfix(modName, modVal));
                }
            } else {
                res.bindEntityCls = ctxCls;
            }

            return res;
        },

        _createEventManager : function(ctx, params, isInstance) {
            throw new Error('not implemented');
        }
    });

provide({
    EventManagerFactory : EventManagerFactory
});

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/i-bem-dom__events.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__collection/i-bem-dom__collection.js */
/**
 * @module i-bem-dom__collection
 */
modules.define('i-bem-dom__collection', ['inherit', 'i-bem__collection'], function(provide, inherit, BemCollection) {

/**
 * @class BemDomCollection
 */
var BemDomCollection = inherit(BemCollection, /** @lends BemDomCollection.prototype */{
    /**
     * Finds the first child block for every entities in collection
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findChildBlock : buildProxyMethodForOne('findChildBlock'),

    /**
     * Finds child block for every entities in collections
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findChildBlocks : buildProxyMethodForMany('findChildBlocks'),

    /**
     * Finds the first parent block for every entities in collection
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findParentBlock : buildProxyMethodForOne('findParentBlock'),

    /**
     * Finds parent block for every entities in collections
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findParentBlocks : buildProxyMethodForMany('findParentBlocks'),

    /**
     * Finds first mixed bloc for every entities in collectionk
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findMixedBlock : buildProxyMethodForOne('findMixedBlock'),

    /**
     * Finds mixed block for every entities in collections
     * @param {Function|Object} Block Block class or description (block, modName, modVal) of the block to find
     * @returns {BemDomCollection}
     */
    findMixedBlocks : buildProxyMethodForMany('findMixedBlocks'),

    /**
     * Finds the first child elemen for every entities in collectiont
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findChildElem : buildProxyMethodForOne('findChildElem'),

    /**
     * Finds child element for every entities in collections
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findChildElems : buildProxyMethodForMany('findChildElems'),

    /**
     * Finds the first parent elemen for every entities in collectiont
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findParentElem : buildProxyMethodForOne('findParentElem'),

    /**
     * Finds parent element for every entities in collections
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @param {Boolean} [strictMode=false]
     * @returns {BemDomCollection}
     */
    findParentElems : buildProxyMethodForMany('findParentElems'),

    /**
     * Finds the first mixed elemen for every entities in collectiont
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {BemDomCollection}
     */
    findMixedElem : buildProxyMethodForOne('findMixedElem'),

    /**
     * Finds mixed element for every entities in collections
     * @param {Function|String|Object} Elem Element class or name or description elem, modName, modVal
     * @returns {BemDomCollection}
     */
    findMixedElems : buildProxyMethodForMany('findMixedElems')
});

function collectionMapMethod(collection, methodName, args) {
    return collection.map(function(entity) {
        return entity[methodName].apply(entity, args);
    });
}

function buildProxyMethodForOne(methodName) {
    return function() {
        return new BemDomCollection(collectionMapMethod(this, methodName, arguments));
    };
}

function buildProxyMethodForMany(methodName) {
    return function() {
        var res = [];

        collectionMapMethod(this, methodName, arguments).forEach(function(collection) {
            collection.forEach(function(entity) {
                res.push(entity);
            });
        });

        return new BemDomCollection(res);
    };
}

provide(BemDomCollection);

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__collection/i-bem-dom__collection.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem/__collection/i-bem__collection.js */
/**
 * @module i-bem__collection
 */
modules.define('i-bem__collection', ['inherit'], function(provide, inherit) {

/**
 * @class BemCollection
 */
var BemCollection = inherit(/** @lends BemCollection.prototype */{
    /**
     * @constructor
     * @param {Array} entities BEM entities
     */
    __constructor : function(entities) {
        var _entities = this._entities = [],
            uniq = {};
        (Array.isArray(entities)? entities : arraySlice.call(arguments)).forEach(function(entity) {
            if(!uniq[entity._uniqId]) {
                uniq[entity._uniqId] = true;
                _entities.push(entity);
            }
        });
    },

    /**
     * Sets the modifier for entities in Collection.
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal=true] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {Collection} this
     */
    setMod : buildForEachEntityMethodProxyFn('setMod'),

    /**
     * Removes the modifier from entities in Collection.
     * @param {String} modName Modifier name
     * @returns {Collection} this
     */
    delMod : buildForEachEntityMethodProxyFn('delMod'),

    /**
     * Sets a modifier for entities in Collection, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @param {String} modName Modifier name
     * @param {String} modVal1 First modifier value
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {Collection} this
     */
    toggleMod : buildForEachEntityMethodProxyFn('toggleMod'),

    /**
     * Checks whether every entity in Collection has a modifier.
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {Boolean}
     */
    everyHasMod : buildComplexProxyFn('every', 'hasMod'),

    /**
     * Checks whether some entities in Collection has a modifier.
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {Boolean}
     */
    someHasMod : buildComplexProxyFn('some', 'hasMod'),

    /**
     * Returns entity by index.
     * @param {Number} i Index
     * @returns {BemEntity}
     */
    get : function(i) {
        return this._entities[i];
    },

    /**
     * Calls callback once for each entity in collection.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     */
    forEach : buildEntitiesMethodProxyFn('forEach'),

    /**
     * Creates an array with the results of calling callback on every entity in collection.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     * @returns {Array}
     */
    map : buildEntitiesMethodProxyFn('map'),

    /**
     * Applies callback against an accumulator and each entity in collection (from left-to-right)
     * to reduce it to a single value.
     * @param {Function} fn Callback
     * @param {Object} [initial] Initial value
     * @returns {Array}
     */
    reduce : buildEntitiesMethodProxyFn('reduce'),

    /**
     * Applies callback against an accumulator and each entity in collection (from right-to-left)
     * to reduce it to a single value.
     * @param {Function} fn Callback
     * @param {Object} [initial] Initial value
     * @returns {Array}
     */
    reduceRight : buildEntitiesMethodProxyFn('reduceRight'),

    /**
     * Creates a new collection with all entities that pass the test implemented by the provided callback.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     * @returns {Collection}
     */
    filter : function() {
        return new this.__self(buildEntitiesMethodProxyFn('filter').apply(this, arguments));
    },

    /**
     * Tests whether some entities in the collection passes the test implemented by the provided callback.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     * @returns {Boolean}
     */
    some : buildEntitiesMethodProxyFn('some'),

    /**
     * Tests whether every entities in the collection passes the test implemented by the provided callback.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     * @returns {Boolean}
     */
    every : buildEntitiesMethodProxyFn('every'),

    /**
     * Returns a boolean asserting whether an entity is present in the collection.
     * @param {BemEntity} entity BEM entity
     * @returns {Boolean}
     */
    has : function(entity) {
        return this._entities.indexOf(entity) > -1;
    },

    /**
     * Returns an entity, if it satisfies the provided testing callback.
     * @param {Function} fn Callback
     * @param {Object} ctx Callback context
     * @returns {BemEntity}
     */
    find : function(fn, ctx) {
        ctx || (ctx = this);
        var entities = this._entities,
            i = 0,
            entity;

        while(entity = entities[i])
            if(fn.call(ctx, entities[i], i++, this))
                return entity;

        return null;
    },

    /**
     * Returns a new collection comprised of collection on which it is called joined with
     * the collection(s) and/or array(s) and/or entity(es) provided as arguments.
     * @param {?...(Collection|Array|BemEntity)} args
     * @returns {Collection}
     */
    concat : function() {
        var i = 0,
            l = arguments.length,
            arg,
            argsForConcat = [];

        while(i < l) {
            arg = arguments[i++];
            argsForConcat.push(
                arg instanceof BemCollection?  arg._entities : arg);
        }

        return new this.__self(arrayConcat.apply(this._entities, argsForConcat));
    },

    /**
     * Returns size of the collection.
     * @returns {Number}
     */
    size : function() {
        return this._entities.length;
    },

    /**
     * Converts the collection into array.
     * @returns {Array}
     */
    toArray : function() {
        return this._entities.slice();
    }
});

function buildForEachEntityMethodProxyFn(methodName) {
    return function() {
        var args = arguments;
        this._entities.forEach(function(entity) {
            entity[methodName].apply(entity, args);
        });
        return this;
    };
}

function buildEntitiesMethodProxyFn(methodName) {
    return function() {
        var entities = this._entities;
        return entities[methodName].apply(entities, arguments);
    };
}

function buildComplexProxyFn(arrayMethodName, entityMethodName) {
    return function() {
        var args = arguments;
        return this._entities[arrayMethodName](function(entity) {
            return entity[entityMethodName].apply(entity, args);
        });
    };
}

var arrayConcat = Array.prototype.concat,
    arraySlice = Array.prototype.slice;

provide(BemCollection);

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem/__collection/i-bem__collection.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/_type/i-bem-dom__events_type_bem.js */
/**
 * @module i-bem-dom__events_type_bem
 */
modules.define(
    'i-bem-dom__events_type_bem',
    [
        'i-bem-dom__events',
        'i-bem__internal',
        'inherit',
        'functions',
        'jquery',
        'identify',
        'events'
    ],
    function(
        provide,
        bemDomEvents,
        bemInternal,
        inherit,
        functions,
        $,
        identify,
        events) {

var EVENT_PREFIX = '__bem__',
    MOD_CHANGE_EVENT = 'modchange',

    specialEvents = $.event.special,
    specialEventsStorage = {},

    createSpecialEvent = function(event) {
        return {
            setup : function() {
                specialEventsStorage[event] || (specialEventsStorage[event] = true);
            },
            teardown : functions.noop
        };
    },

    eventBuilder = function(e, params) {
        var event = EVENT_PREFIX + params.bindEntityCls.getEntityName() +
            (typeof e === 'object'?
                e instanceof events.Event?
                    e.type :
                    bemInternal.buildModPostfix(e.modName, e.modVal) :
                e);

        specialEvents[event] ||
            (specialEvents[event] = createSpecialEvent(event));

        return event;
    },

    /**
     * @class EventManagerFactory
     * @augments i-bem-dom__events:EventManagerFactory
     * @exports i-bem-dom__events_type_bem:EventManagerFactory
     */
    EventManagerFactory = inherit(bemDomEvents.EventManagerFactory,/** @lends EventManagerFactory.prototype */{
        /** @override */
        _createEventManager : function(ctx, params, isInstance) {
            function wrapperFn(fn, fnCtx, fnId) {
                return function(e, data, flags, originalEvent) {
                    if(flags.fns[fnId]) return;

                    var instance,
                        instanceDomElem;

                    if(isInstance) {
                        instance = ctx;
                        instanceDomElem = instance.domElem;
                    } else {
                        // TODO: we could optimize all these "closest" to a single traversing
                        instanceDomElem = $(e.target).closest(params.ctxSelector);
                        instanceDomElem.length && (instance = instanceDomElem.bem(ctx));
                    }

                    if(instance &&
                        (!flags.propagationStoppedDomNode ||
                            !$.contains(instanceDomElem[0], flags.propagationStoppedDomNode))) {
                        originalEvent.data = e.data;
                        // TODO: do we really need both target and bemTarget?
                        originalEvent.bemTarget = originalEvent.target;
                        flags.fns[fnId] = true;
                        fn.call(fnCtx || instance, originalEvent, data);

                        if(originalEvent.isPropagationStopped()) {
                            e.stopPropagation();
                            flags.propagationStoppedDomNode = instanceDomElem[0];
                        }
                    }
                };
            }

            return new this._eventManagerCls(params, wrapperFn, eventBuilder);
        }
    });

provide(/** @exports */ {
    /**
     * Emits BEM event
     * @augments i-bem-dom__events_type_bem
     * @param {BemDomEntity} ctx
     * @param {String|Object|events:Event} e Event name
     * @param {Object} [data]
     */
    emit : function(ctx, e, data) {
        var originalEvent;
        if(typeof e === 'string') {
            originalEvent = new events.Event(e, ctx);
        } else if(e.modName) {
            originalEvent = new events.Event(MOD_CHANGE_EVENT, ctx);
        } else if(!e.target) {
            e.target = ctx;
            originalEvent = e;
        }

        var event = eventBuilder(e, { bindEntityCls : ctx.__self });

        specialEventsStorage[event] &&
            ctx.domElem.trigger(event, [data, { fns : {}, propagationStoppedDomNode : null }, originalEvent]);
    },

    EventManagerFactory : EventManagerFactory
});

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/_type/i-bem-dom__events_type_bem.js */
/* begin: ../../node_modules/bem-core/common.blocks/events/events.vanilla.js */
/**
 * @module events
 */

modules.define(
    'events',
    ['identify', 'inherit', 'functions'],
    function(provide, identify, inherit, functions) {

var undef,
    storageExpando = '__' + (+new Date) + 'storage',

    /**
     * @class Event
     * @exports events:Event
     */
    Event = inherit(/** @lends Event.prototype */{
        /**
         * @constructor
         * @param {String} type
         * @param {Object} target
         */
        __constructor : function(type, target) {
            /**
             * Type
             * @member {String}
             */
            this.type = type;

            /**
             * Target
             * @member {Object}
             */
            this.target = target;

            /**
             * Data
             * @member {*}
             */
            this.data = undef;

            this._isDefaultPrevented = false;
            this._isPropagationStopped = false;
        },

        /**
         * Prevents default action
         */
        preventDefault : function() {
            this._isDefaultPrevented = true;
        },

        /**
         * Returns whether is default action prevented
         * @returns {Boolean}
         */
        isDefaultPrevented : function() {
            return this._isDefaultPrevented;
        },

        /**
         * Stops propagation
         */
        stopPropagation : function() {
            this._isPropagationStopped = true;
        },

        /**
         * Returns whether is propagation stopped
         * @returns {Boolean}
         */
        isPropagationStopped : function() {
            return this._isPropagationStopped;
        }
    }),

    /**
     * @class Emitter
     * @exports events:Emitter
     */
    Emitter = inherit(/** @lends Emitter.prototype */{
        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        on : function(e, data, fn, ctx, _special) {
            if(typeof e === 'string') {
                if(functions.isFunction(data)) {
                    ctx = fn;
                    fn = data;
                    data = undef;
                }

                var id = identify(fn, ctx),
                    storage = this[storageExpando] || (this[storageExpando] = {}),
                    eventTypes = e.split(' '), eventType,
                    i = 0, list, item,
                    eventStorage;

                while(eventType = eventTypes[i++]) {
                    eventStorage = storage[eventType] || (storage[eventType] = { ids : {}, list : {} });
                    if(!(id in eventStorage.ids)) {
                        list = eventStorage.list;
                        item = { fn : fn, data : data, ctx : ctx, special : _special };
                        if(list.last) {
                            list.last.next = item;
                            item.prev = list.last;
                        } else {
                            list.first = item;
                        }
                        eventStorage.ids[id] = list.last = item;
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.on(key, e[key], data, _special);
                }
            }

            return this;
        },

        /**
         * Adds a one time handler for the event.
         * Handler is executed only the next time the event is fired, after which it is removed.
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        once : function(e, data, fn, ctx) {
            return this.on(e, data, fn, ctx, { once : true });
        },

        /**
         * Removes event handler or handlers
         * @param {String} [e] Event type
         * @param {Function} [fn] Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        un : function(e, fn, ctx) {
            if(typeof e === 'string' || typeof e === 'undefined') {
                var storage = this[storageExpando];
                if(storage) {
                    if(e) { // if event type was passed
                        var eventTypes = e.split(' '),
                            i = 0, eventStorage;
                        while(e = eventTypes[i++]) {
                            if(eventStorage = storage[e]) {
                                if(fn) {  // if specific handler was passed
                                    var id = identify(fn, ctx),
                                        ids = eventStorage.ids;
                                    if(id in ids) {
                                        var list = eventStorage.list,
                                            item = ids[id],
                                            prev = item.prev,
                                            next = item.next;

                                        if(prev) {
                                            prev.next = next;
                                        } else if(item === list.first) {
                                            list.first = next;
                                        }

                                        if(next) {
                                            next.prev = prev;
                                        } else if(item === list.last) {
                                            list.last = prev;
                                        }

                                        delete ids[id];
                                    }
                                } else {
                                    delete this[storageExpando][e];
                                }
                            }
                        }
                    } else {
                        delete this[storageExpando];
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.un(key, e[key], fn);
                }
            }

            return this;
        },

        /**
         * Fires event handlers
         * @param {String|events:Event} e Event
         * @param {Object} [data] Additional data
         * @returns {Emitter} this
         */
        emit : function(e, data) {
            var storage = this[storageExpando],
                eventInstantiated = false;

            if(storage) {
                var eventTypes = [typeof e === 'string'? e : e.type, '*'],
                    i = 0, eventType, eventStorage;
                while(eventType = eventTypes[i++]) {
                    if(eventStorage = storage[eventType]) {
                        var item = eventStorage.list.first,
                            lastItem = eventStorage.list.last,
                            res;
                        while(item) {
                            if(!eventInstantiated) { // instantiate Event only on demand
                                eventInstantiated = true;
                                typeof e === 'string' && (e = new Event(e));
                                e.target || (e.target = this);
                            }

                            e.data = item.data;
                            res = item.fn.apply(item.ctx || this, arguments);
                            if(res === false) {
                                e.preventDefault();
                                e.stopPropagation();
                            }

                            item.special && item.special.once &&
                                this.un(e.type, item.fn, item.ctx);

                            if(item === lastItem) {
                                break;
                            }

                            item = item.next;
                        }
                    }
                }
            }

            return this;
        }
    });

provide({
    Emitter : Emitter,
    Event : Event
});

});

/* end: ../../node_modules/bem-core/common.blocks/events/events.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__init/_auto/i-bem-dom__init_auto.js */
/**
 * Auto initialization on DOM ready
 */

modules.require(
    ['i-bem-dom__init', 'jquery', 'next-tick'],
    function(init, $, nextTick) {

$(function() {
    nextTick(init);
});

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__init/_auto/i-bem-dom__init_auto.js */
/* begin: ../../desktop.blocks/navigation/navigation.js */
modules.define('navigation', ['i-bem-dom', 'button', 'input'], function(provide, bemDom, Button, Input){
  provide(bemDom.declBlock(this.name, {
    onSetMod: {
      'js' : {
        'inited' : function(modName, modVal) {
          this._buttonFind = this.findChildBlock({ block: Button, modName: 'notShow', modVal: false });

          this._domEvents(this._buttonFind).on('click', this._onClick);
          this._domEvents(this._buttonFind).on('click', this._toHideButton);
        }
      }
    },
    _onClick: function() {
      this._input = this.findChildBlock(Input).setMod('notShow', false);
    },
    _toHideButton: function() {
      this._buttonFind.setMod('notShow', true);
    }
  }));
});

/* end: ../../desktop.blocks/navigation/navigation.js */
/* begin: ../../node_modules/bem-components/common.blocks/menu/menu.js */
/**
 * @module menu
 */

modules.define(
    'menu',
    ['i-bem-dom', 'control', 'keyboard__codes', 'menu__item'],
    function(provide, bemDom, Control, keyCodes, MenuItem) {

/** @const Number */
var TIMEOUT_KEYBOARD_SEARCH = 1500;

/**
 * @exports
 * @class menu
 * @augments control
 * @bem
 */
provide(bemDom.declBlock(this.name, Control, /** @lends menu.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._hoveredItem = null;
                this._items = null;

                this._lastTyping = {
                    char : '',
                    text : '',
                    index : 0,
                    time : 0
                };
            }
        },

        'disabled' : {
            '*' : function(modName, modVal) {
                this.__base.apply(this, arguments);
                this.getItems().setMod(modName, modVal);
            },
            'true' : function() {
                this.__base.apply(this, arguments);
                this.domElem.attr('aria-disabled', true);
            },
            '' : function() {
                this.__base.apply(this, arguments);
                this.domElem.removeAttr('aria-disabled');
            }
        }
    },

    /**
     * Returns items
     * @returns {menu__item[]}
     */
    getItems : function() {
        return this._items || (this._items = this.findChildElems('item'));
    },

    /**
     * Sets content
     * @param {String|jQuery} content
     * @returns {menu} this
     */
    setContent : function(content) {
        bemDom.update(this.domElem, content);
        this._hoveredItem = null;
        this._items = null;
        return this;
    },

    /**
     * Search menu item by keyboard event
     * @param {jQuery.Event} e
     * @returns {menu__item}
     */
    searchItemByKeyboardEvent : function(e) {
        var currentTime = +new Date(),
            charCode = e.charCode,
            char = String.fromCharCode(charCode).toLowerCase(),
            lastTyping = this._lastTyping,
            index = lastTyping.index,
            isSameChar = char === lastTyping.char && lastTyping.text.length === 1,
            items = this.getItems();

        if(charCode <= keyCodes.SPACE || e.ctrlKey || e.altKey || e.metaKey) {
            lastTyping.time = currentTime;
            return null;
        }

        if(currentTime - lastTyping.time > TIMEOUT_KEYBOARD_SEARCH || isSameChar) {
            lastTyping.text = char;
        } else {
            lastTyping.text += char;
        }

        lastTyping.char = char;
        lastTyping.time = currentTime;

        // If key is pressed again, then continue to search to next menu item
        if(isSameChar && items.get(index).getText().search(lastTyping.char) === 0) {
            index = index >= items.size() - 1? 0 : index + 1;
        }

        // 2 passes: from index to items.size() and from 0 to index.
        var i = index, len = items.size();
        while(i < len) {
            if(this._doesItemMatchText(items.get(i), lastTyping.text)) {
                lastTyping.index = i;
                return items.get(i);
            }

            i++;

            if(i === items.size()) {
                i = 0;
                len = index;
            }
        }

        return null;
    },

    /** @override **/
    _onFocus : function() {
        this.__base.apply(this, arguments);
        this._domEvents(bemDom.doc) // NOTE: should be called after __base
            .on('keydown', this._onKeyDown)
            .on('keypress', this._onKeyPress);
    },

    /** @override **/
    _onBlur : function() {
        this._domEvents(bemDom.doc)
            .un('keydown', this._onKeyDown)
            .un('keypress', this._onKeyPress);

        this.__base.apply(this, arguments);
        this._hoveredItem && this._hoveredItem.delMod('hovered');
    },

    /**
     * @param {Object} item
     * @private
     */
    _onItemHover : function(item) {
        if(item.hasMod('hovered')) {
            this._hoveredItem && this._hoveredItem.delMod('hovered');
            this._scrollToItem(this._hoveredItem = item);
            this.domElem.attr('aria-activedescendant', item.domElem.attr('id'));
        } else if(this._hoveredItem === item) {
            this._hoveredItem = null;
            this.domElem.removeAttr('aria-activedescendant');
        }
        this._emit('item-hover', { item : item });
    },

    /**
     * @param {Object} item
     * @private
     */
    _scrollToItem : function(item) {
        var domElemOffsetTop = this.domElem.offset().top,
            itemDomElemOffsetTop = item.domElem.offset().top,
            relativeScroll;

        if((relativeScroll = itemDomElemOffsetTop - domElemOffsetTop) < 0 ||
            (relativeScroll =
                itemDomElemOffsetTop +
                item.domElem.outerHeight() -
                domElemOffsetTop -
                this.domElem.outerHeight()) > 0) {
            this.domElem.scrollTop(this.domElem.scrollTop() + relativeScroll);
        }
    },

    /**
     * @param {Object} item
     * @param {Object} data
     * @private
     */
    _onItemClick : function(item, data) {
        this._emit('item-click', { item : item, source : data.source });
    },

    /**
     * @param {jQuery.Event} e
     * @private
     */
    _onKeyDown : function(e) {
        var keyCode = e.keyCode,
            isArrow = keyCode === keyCodes.UP || keyCode === keyCodes.DOWN;

        if(isArrow && !e.shiftKey) {
            e.preventDefault();

            var dir = keyCode - 39, // using the features of key codes for "up"/"down" ;-)
                items = this.getItems(),
                len = items.size(),
                hoveredIdx = items.toArray().indexOf(this._hoveredItem),
                nextIdx = hoveredIdx,
                i = 0;

            do {
                nextIdx += dir;
                nextIdx = nextIdx < 0? len - 1 : nextIdx >= len? 0 : nextIdx;
                if(++i === len) return; // if we have no next item to hover
            } while(items.get(nextIdx).hasMod('disabled'));

            this._lastTyping.index = nextIdx;

            items.get(nextIdx).setMod('hovered');
        }
    },

    /**
     * @param {jQuery.Event} e
     * @private
     */
    _onKeyPress : function(e) {
        var item = this.searchItemByKeyboardEvent(e);
        item && item.setMod('hovered');
    },

    /**
     * @param {Object} item
     * @param {String} text
     * @private
     */
    _doesItemMatchText : function(item, text) {
        return !item.hasMod('disabled') &&
            item.getText().toLowerCase().search(text) === 0;
    }
}, /** @lends menu */{
    lazyInit : true,
    onInit : function() {
        this._events(MenuItem)
            .on({ modName : 'hovered', modVal : '*' }, function(e) {
                this._onItemHover(e.target);
            })
            .on('click', function(e, data) {
                this._onItemClick(e.target, data);
            });

        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/menu/menu.js */
/* begin: ../../node_modules/bem-components/common.blocks/control/control.js */
/**
 * @module control
 */

modules.define(
    'control',
    ['i-bem-dom', 'dom', 'next-tick'],
    function(provide, bemDom, dom, nextTick) {

/**
 * @exports
 * @class control
 * @abstract
 * @bem
 */
provide(bemDom.declBlock(this.name, /** @lends control.prototype */{
    beforeSetMod : {
        'focused' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                var controlDomElem = this._elem('control').domElem;

                this._focused = dom.containsFocus(controlDomElem);
                this._focused?
                    // if control is already in focus, we need to force _onFocus
                    this._onFocus() :
                    // if block already has focused mod, we need to focus control
                    this.hasMod('focused') && this._focus();

                this._tabIndex = typeof this.params.tabIndex !== 'undefined'?
                    this.params.tabIndex :
                    controlDomElem.attr('tabindex');

                if(this.hasMod('disabled') && this._tabIndex !== 'undefined')
                    controlDomElem.removeAttr('tabindex');
            }
        },

        'focused' : {
            'true' : function() {
                this._focused || this._focus();
            },

            '' : function() {
                this._focused && this._blur();
            }
        },

        'disabled' : {
            'true' : function() {
                this._elem('control').domElem.attr('disabled', true);
                this.delMod('focused');
                typeof this._tabIndex !== 'undefined' &&
                    this._elem('control').domElem.removeAttr('tabindex');
            },

            '' : function() {
                this._elem('control').domElem.removeAttr('disabled');
                typeof this._tabIndex !== 'undefined' &&
                    this._elem('control').domElem.attr('tabindex', this._tabIndex);
            }
        }
    },

    /**
     * Returns name of control
     * @returns {String}
     */
    getName : function() {
        return this._elem('control').domElem.attr('name') || '';
    },

    /**
     * Returns control value
     * @returns {String}
     */
    getVal : function() {
        return this._elem('control').domElem.val();
    },

    _onFocus : function() {
        this._focused = true;
        this.setMod('focused');
    },

    _onBlur : function() {
        this._focused = false;
        this.delMod('focused');
    },

    _focus : function() {
        dom.isFocusable(this._elem('control').domElem)?
            this._elem('control').domElem.focus() :
            this._onFocus(); // issues/1456
    },

    _blur : function() {
        // force both `blur` and `_onBlur` for FF which can have disabled element as `document.activeElement`
        this._elem('control').domElem.blur();
        this._onBlur();
    }
}, /** @lends control */{
    lazyInit : true,
    onInit : function() {
        this._domEvents('control')
            .on('focusin', function() {
                this._focused || this._onFocus(); // to prevent double call of _onFocus in case of init by focus
            })
            .on('focusout', this.prototype._onBlur);

        var focused = dom.getFocused();
        if(focused.hasClass(this._buildClassName('control'))) {
            var _this = this;
            nextTick(function() {
                if(focused[0] === dom.getFocused()[0]) {
                    var block = focused.closest(_this._buildSelector());
                    block && block.bem(_this);
                }
            });
        }
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/control/control.js */
/* begin: ../../node_modules/bem-components/desktop.blocks/control/control.js */
/** @module control */

modules.define(
    'control', ['i-bem-dom'],
    function(provide, bemDom, Control) {

provide(bemDom.declBlock(Control, {
    beforeSetMod : {
        'hovered' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.delMod('hovered');
            }
        },

        'hovered' : {
            'true' : function() {
                this._domEvents().on('mouseleave', this._onMouseLeave);
            },

            '' : function() {
                this._domEvents().un('mouseleave', this._onMouseLeave);
            }
        }
    },

    _onMouseOver : function() {
        this.setMod('hovered');
    },

    _onMouseLeave : function() {
        this.delMod('hovered');
    }
}, {
    onInit : function() {
        this._domEvents().on('mouseover', this.prototype._onMouseOver);
        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../node_modules/bem-components/desktop.blocks/control/control.js */
/* begin: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js */
modules.define('jquery', ['next-tick'], function(provide, nextTick, $) {

var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    event = $.event.special.pointerclick = {
        setup : function() {
            if(isIOS) {
                $(this)
                    .on('pointerdown', event.onPointerdown)
                    .on('pointerup', event.onPointerup)
                    .on('pointerleave pointercancel', event.onPointerleave);
            } else {
                $(this).on('click', event.handler);
            }
        },

        teardown : function() {
            if(isIOS) {
                $(this)
                    .off('pointerdown', event.onPointerdown)
                    .off('pointerup', event.onPointerup)
                    .off('pointerleave pointercancel', event.onPointerleave);
            } else {
                $(this).off('click', event.handler);
            }
        },

        handler : function(e) {
            if(!e.button) {
                var type = e.type;
                e.type = 'pointerclick';
                $.event.dispatch.apply(this, arguments);
                e.type = type;
            }
        },

        onPointerdown : function(e) {
            pointerdownEvent = e;
        },

        onPointerleave : function() {
            pointerdownEvent = null;
        },

        onPointerup : function(e) {
            if(!pointerdownEvent) return;

            if(!pointerDownUpInProgress) {
                nextTick(function() {
                    pointerDownUpInProgress = false;
                    pointerdownEvent = null;
                });
                pointerDownUpInProgress = true;
            }

            event.handler.apply(this, arguments);
        }
    },
    pointerDownUpInProgress = false,
    pointerdownEvent;

provide($);

});

/* end: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js */
/* begin: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointernative.js */
;(function(global, factory) {

if(typeof modules === 'object' && modules.isDefined('jquery')) {
    modules.define('jquery', function(provide, $) {
        factory(this.global, $);
        provide($);
    });
} else if(typeof jQuery === 'function') {
    factory(global, jQuery);
}

}(this, function(window, $) {

var jqEvent = $.event;

// NOTE: Remove jQuery special fixes for pointerevents – we fix them ourself
delete jqEvent.special.pointerenter;
delete jqEvent.special.pointerleave;

if(window.PointerEvent) {
    // Have native PointerEvent support, nothing to do than
    return;
}

/*!
 * Most of source code is taken from PointerEvents Polyfill
 * written by Polymer Team (https://github.com/Polymer/PointerEvents)
 * and licensed under the BSD License.
 */

var doc = document,
    HAS_BITMAP_TYPE = window.MSPointerEvent && typeof window.MSPointerEvent.MSPOINTER_TYPE_MOUSE === 'number',
    undef;

/*!
 * Returns a snapshot of the event, with writable properties.
 *
 * @param {Event} event An event that contains properties to copy.
 * @returns {Object} An object containing shallow copies of `inEvent`'s properties.
 */
function cloneEvent(event) {
    var eventCopy = $.extend(new $.Event(), event);
    if(event.preventDefault) {
        eventCopy.preventDefault = function() {
            event.preventDefault();
        };
    }
    return eventCopy;
}

/*!
 * Dispatches the event to the target, taking event's bubbling into account.
 */
function dispatchEvent(event, target) {
    return event.bubbles?
        jqEvent.trigger(event, null, target) :
        jqEvent.dispatch.call(target, event);
}

var MOUSE_PROPS = {
        bubbles : false,
        cancelable : false,
        view : null,
        detail : null,
        screenX : 0,
        screenY : 0,
        clientX : 0,
        clientY : 0,
        ctrlKey : false,
        altKey : false,
        shiftKey : false,
        metaKey : false,
        button : 0,
        relatedTarget : null,
        pageX : 0,
        pageY : 0
    },
    mouseProps = Object.keys(MOUSE_PROPS),
    mousePropsLen = mouseProps.length,
    mouseDefaults = mouseProps.map(function(prop) { return MOUSE_PROPS[prop] });

/*!
 * Pointer event constructor
 *
 * @class PointerEvent
 * @param {String} type
 * @param {Object} [params]
 * @returns {Event}
 * @constructor
 */
function PointerEvent(type, params) {
    params || (params = {});

    var e = $.Event(type);

    // define inherited MouseEvent properties
    for(var i = 0, p; i < mousePropsLen; i++) {
        p = mouseProps[i];
        e[p] = params[p] || mouseDefaults[i];
    }

    e.buttons = params.buttons || 0;

    // add x/y properties aliased to clientX/Y
    e.x = e.clientX;
    e.y = e.clientY;

    // Spec requires that pointers without pressure specified use 0.5 for down
    // state and 0 for up state.
    var pressure = 0;
    if(params.pressure) {
        pressure = params.pressure;
    } else {
        pressure = e.buttons? 0.5 : 0;
    }

    // define the properties of the PointerEvent interface
    e.pointerId = params.pointerId || 0;
    e.width = params.width || 0;
    e.height = params.height || 0;
    e.pressure = pressure;
    e.tiltX = params.tiltX || 0;
    e.tiltY = params.tiltY || 0;
    e.pointerType = params.pointerType || '';
    e.hwTimestamp = params.hwTimestamp || 0;
    e.isPrimary = params.isPrimary || false;

    // add some common jQuery properties
    e.which = typeof params.which === 'undefined'? 1 : params.which;

    return e;
}

function SparseArrayMap() {
    this.array = [];
    this.size = 0;
}

SparseArrayMap.prototype = {
    set : function(k, v) {
        if(v === undef) {
            return this['delete'](k);
        }
        if(!this.has(k)) {
            this.size++;
        }
        this.array[k] = v;
    },

    has : function(k) {
        return this.array[k] !== undef;
    },

    'delete' : function(k) {
        if(this.has(k)){
            delete this.array[k];
            this.size--;
        }
    },

    get : function(k) {
        return this.array[k];
    },

    clear : function() {
        this.array.length = 0;
        this.size = 0;
    },

    // return value, key, map
    forEach : function(callback, ctx) {
        return this.array.forEach(function(v, k) {
            callback.call(ctx, v, k, this);
        }, this);
    }
};

// jscs:disable requireMultipleVarDecl
var PointerMap = window.Map && window.Map.prototype.forEach? Map : SparseArrayMap,
    pointerMap = new PointerMap();

var dispatcher = {
    eventMap : {},
    eventSourceList : [],

    /*!
     * Add a new event source that will generate pointer events
     */
    registerSource : function(name, source) {
        var newEvents = source.events;
        if(newEvents) {
            newEvents.forEach(function(e) {
                source[e] && (this.eventMap[e] = function() { source[e].apply(source, arguments) });
            }, this);
            this.eventSourceList.push(source);
        }
    },

    register : function(element) {
        var len = this.eventSourceList.length;
        for(var i = 0, es; (i < len) && (es = this.eventSourceList[i]); i++) {
            // call eventsource register
            es.register.call(es, element);
        }
    },

    unregister : function(element) {
        var l = this.eventSourceList.length;
        for(var i = 0, es; (i < l) && (es = this.eventSourceList[i]); i++) {
            // call eventsource register
            es.unregister.call(es, element);
        }
    },

    down : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerdown', event);
    },

    move : function(event) {
        event.bubbles = true;
        this.fireEvent('pointermove', event);
    },

    up : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerup', event);
    },

    enter : function(event) {
        event.bubbles = false;
        this.fireEvent('pointerenter', event);
    },

    leave : function(event) {
        event.bubbles = false;
        this.fireEvent('pointerleave', event);
    },

    over : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerover', event);
    },

    out : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerout', event);
    },

    cancel : function(event) {
        event.bubbles = true;
        this.fireEvent('pointercancel', event);
    },

    leaveOut : function(event) {
        this.out(event);
        this.enterLeave(event, this.leave);
    },

    enterOver : function(event) {
        this.over(event);
        this.enterLeave(event, this.enter);
    },

    enterLeave : function(event, fn) {
        var target = event.target,
            relatedTarget = event.relatedTarget;

        if(!this.contains(target, relatedTarget)) {
            while(target && target !== relatedTarget) {
                event.target = target;
                fn.call(this, event);

                target = target.parentNode;
            }
        }
    },

    contains : function(target, relatedTarget) {
        return target === relatedTarget || $.contains(target, relatedTarget);
    },

    // LISTENER LOGIC
    eventHandler : function(e) {
        // This is used to prevent multiple dispatch of pointerevents from
        // platform events. This can happen when two elements in different scopes
        // are set up to create pointer events, which is relevant to Shadow DOM.
        if(e._handledByPE) {
            return;
        }

        var type = e.type, fn;
        (fn = this.eventMap && this.eventMap[type]) && fn(e);

        e._handledByPE = true;
    },

    /*!
     * Sets up event listeners
     */
    listen : function(target, events) {
        events.forEach(function(e) {
            this.addEvent(target, e);
        }, this);
    },

    /*!
     * Removes event listeners
     */
    unlisten : function(target, events) {
        events.forEach(function(e) {
            this.removeEvent(target, e);
        }, this);
    },

    addEvent : function(target, eventName) {
        $(target).on(eventName, boundHandler);
    },

    removeEvent : function(target, eventName) {
        $(target).off(eventName, boundHandler);
    },

    getTarget : function(event) {
        return event._target;
    },

    /*!
     * Creates a new Event of type `type`, based on the information in `event`
     */
    makeEvent : function(type, event) {
        var e = new PointerEvent(type, event);
        if(event.preventDefault) {
            e.preventDefault = event.preventDefault;
        }

        e._target = e._target || event.target;

        return e;
    },

    /*!
     * Dispatches the event to its target
     */
    dispatchEvent : function(event) {
        var target = this.getTarget(event);
        if(target) {
            if(!event.target) {
                event.target = target;
            }

            return dispatchEvent(event, target);
        }
    },

    /*!
     * Makes and dispatch an event in one call
     */
    fireEvent : function(type, event) {
        var e = this.makeEvent(type, event);
        return this.dispatchEvent(e);
    }
};

function boundHandler() {
    dispatcher.eventHandler.apply(dispatcher, arguments);
}

var CLICK_COUNT_TIMEOUT = 200,
    // Radius around touchend that swallows mouse events
    MOUSE_DEDUP_DIST = 25,
    MOUSE_POINTER_ID = 1,
    // This should be long enough to ignore compat mouse events made by touch
    TOUCH_DEDUP_TIMEOUT = 2500,
    // A distance for which touchmove should fire pointercancel event
    TOUCHMOVE_HYSTERESIS = 20;

// handler block for native mouse events
var mouseEvents = {
    POINTER_TYPE : 'mouse',
    events : [
        'mousedown',
        'mousemove',
        'mouseup',
        'mouseover',
        'mouseout'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    lastTouches : [],

    // collide with the global mouse listener
    isEventSimulatedFromTouch : function(event) {
        var lts = this.lastTouches,
            x = event.clientX,
            y = event.clientY;

        for(var i = 0, l = lts.length, t; i < l && (t = lts[i]); i++) {
            // simulated mouse events will be swallowed near a primary touchend
            var dx = Math.abs(x - t.x), dy = Math.abs(y - t.y);
            if(dx <= MOUSE_DEDUP_DIST && dy <= MOUSE_DEDUP_DIST) {
                return true;
            }
        }
    },

    prepareEvent : function(event) {
        var e = cloneEvent(event);
        e.pointerId = MOUSE_POINTER_ID;
        e.isPrimary = true;
        e.pointerType = this.POINTER_TYPE;
        return e;
    },

    mousedown : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            if(pointerMap.has(MOUSE_POINTER_ID)) {
                // http://crbug/149091
                this.cancel(event);
            }

            pointerMap.set(MOUSE_POINTER_ID, event);

            var e = this.prepareEvent(event);
            dispatcher.down(e);
        }
    },

    mousemove : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.move(e);
        }
    },

    mouseup : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var p = pointerMap.get(MOUSE_POINTER_ID);
            if(p && p.button === event.button) {
                var e = this.prepareEvent(event);
                dispatcher.up(e);
                this.cleanupMouse();
            }
        }
    },

    mouseover : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.enterOver(e);
        }
    },

    mouseout : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.leaveOut(e);
        }
    },

    cancel : function(inEvent) {
        var e = this.prepareEvent(inEvent);
        dispatcher.cancel(e);
        this.cleanupMouse();
    },

    cleanupMouse : function() {
        pointerMap['delete'](MOUSE_POINTER_ID);
    }
};

var touchEvents = {
    events : [
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    POINTER_TYPE : 'touch',
    clickCount : 0,
    resetId : null,
    firstTouch : null,

    isPrimaryTouch : function(touch) {
        return this.firstTouch === touch.identifier;
    },

    /*!
     * Sets primary touch if there no pointers, or the only pointer is the mouse
     */
    setPrimaryTouch : function(touch) {
        if(pointerMap.size === 0 ||
                (pointerMap.size === 1 && pointerMap.has(MOUSE_POINTER_ID))) {
            this.firstTouch = touch.identifier;
            this.firstXY = { X : touch.clientX, Y : touch.clientY };
            this.scrolling = null;

            this.cancelResetClickCount();
        }
    },

    removePrimaryPointer : function(pointer) {
        if(pointer.isPrimary) {
            this.firstTouch = null;
            // TODO(@narqo): It seems that, flushing `firstXY` flag explicitly in `touchmove` handler is enough.
            // Original code from polymer doing `this.firstXY = null` on every `removePrimaryPointer` call, but looks
            // like it is harmful in some of our usecases.
            this.resetClickCount();
        }
    },

    resetClickCount : function() {
        var _this = this;
        this.resetId = setTimeout(function() {
            _this.clickCount = 0;
            _this.resetId = null;
        }, CLICK_COUNT_TIMEOUT);
    },

    cancelResetClickCount : function() {
        this.resetId && clearTimeout(this.resetId);
    },

    typeToButtons : function(type) {
        return type === 'touchstart' || type === 'touchmove'? 1 : 0;
    },

    findTarget : function(event) {
        // Currently we don't interested in shadow dom handling
        return doc.elementFromPoint(event.clientX, event.clientY);
    },

    touchToPointer : function(touch) {
        var cte = this.currentTouchEvent,
            e = cloneEvent(touch);

        // Spec specifies that pointerId 1 is reserved for Mouse.
        // Touch identifiers can start at 0.
        // Add 2 to the touch identifier for compatibility.
        e.pointerId = touch.identifier + 2;
        e.target = this.findTarget(e);
        e.bubbles = true;
        e.cancelable = true;
        e.detail = this.clickCount;
        e.button = 0;
        e.buttons = this.typeToButtons(cte.type);
        e.width = touch.webkitRadiusX || touch.radiusX || 0;
        e.height = touch.webkitRadiusY || touch.radiusY || 0;
        e.pressure = touch.mozPressure || touch.webkitForce || touch.force || 0.5;
        e.isPrimary = this.isPrimaryTouch(touch);
        e.pointerType = this.POINTER_TYPE;

        // forward touch preventDefaults
        var _this = this;
        e.preventDefault = function() {
            _this.scrolling = false;
            _this.firstXY = null;
            cte.preventDefault();
        };

        return e;
    },

    processTouches : function(event, fn) {
        var tl = event.originalEvent.changedTouches;
        this.currentTouchEvent = event;
        for(var i = 0, t; i < tl.length; i++) {
            t = tl[i];
            fn.call(this, this.touchToPointer(t));
        }
    },

    shouldScroll : function(touchEvent) {
        // return "true" for things to be much easier
        return true;
    },

    findTouch : function(touches, pointerId) {
        for(var i = 0, l = touches.length, t; i < l && (t = touches[i]); i++) {
            if(t.identifier === pointerId) {
                return true;
            }
        }
    },

    /*!
     * In some instances, a touchstart can happen without a touchend.
     * This leaves the pointermap in a broken state.
     * Therefore, on every touchstart, we remove the touches
     * that did not fire a touchend event.
     *
     * To keep state globally consistent, we fire a pointercancel
     * for this "abandoned" touch
     */
    vacuumTouches : function(touchEvent) {
        var touches = touchEvent.touches;
        // `pointermap.size` should be less than length of touches here, as the touchstart has not
        // been processed yet.
        if(pointerMap.size >= touches.length) {
            var d = [];

            pointerMap.forEach(function(pointer, pointerId) {
                // Never remove pointerId == 1, which is mouse.
                // Touch identifiers are 2 smaller than their pointerId, which is the
                // index in pointermap.
                if(pointerId === MOUSE_POINTER_ID || this.findTouch(touches, pointerId - 2)) return;
                d.push(pointer.outEvent);
            }, this);

            d.forEach(this.cancelOut, this);
        }
    },

    /*!
     * Prevents synth mouse events from creating pointer events
     */
    dedupSynthMouse : function(touchEvent) {
        var lts = mouseEvents.lastTouches,
            t = touchEvent.changedTouches[0];

        // only the primary finger will synth mouse events
        if(this.isPrimaryTouch(t)) {
            // remember x/y of last touch
            var lt = { x : t.clientX, y : t.clientY };
            lts.push(lt);

            setTimeout(function() {
                var i = lts.indexOf(lt);
                i > -1 && lts.splice(i, 1);
            }, TOUCH_DEDUP_TIMEOUT);
        }
    },

    touchstart : function(event) {
        var touchEvent = event.originalEvent;

        this.vacuumTouches(touchEvent);
        this.setPrimaryTouch(touchEvent.changedTouches[0]);
        this.dedupSynthMouse(touchEvent);

        if(!this.scrolling) {
            this.clickCount++;
            this.processTouches(event, this.overDown);
        }
    },

    touchmove : function(event) {
        var touchEvent = event.originalEvent;
        if(!this.scrolling) {
            if(this.scrolling === null && this.shouldScroll(touchEvent)) {
                this.scrolling = true;
            } else {
                event.preventDefault();
                this.processTouches(event, this.moveOverOut);
            }
        } else if(this.firstXY) {
            var firstXY = this.firstXY,
                touch = touchEvent.changedTouches[0],
                dx = touch.clientX - firstXY.X,
                dy = touch.clientY - firstXY.Y,
                dd = Math.sqrt(dx * dx + dy * dy);
            if(dd >= TOUCHMOVE_HYSTERESIS) {
                this.touchcancel(event);
                this.scrolling = true;
                this.firstXY = null;
            }
        }
    },

    touchend : function(event) {
        var touchEvent = event.originalEvent;
        this.dedupSynthMouse(touchEvent);
        this.processTouches(event, this.upOut);
    },

    touchcancel : function(event) {
        this.processTouches(event, this.cancelOut);
    },

    overDown : function(pEvent) {
        var target = pEvent.target;
        pointerMap.set(pEvent.pointerId, {
            target : target,
            outTarget : target,
            outEvent : pEvent
        });
        dispatcher.over(pEvent);
        dispatcher.enter(pEvent);
        dispatcher.down(pEvent);
    },

    moveOverOut : function(pEvent) {
        var pointer = pointerMap.get(pEvent.pointerId);

        // a finger drifted off the screen, ignore it
        if(!pointer) {
            return;
        }

        dispatcher.move(pEvent);

        var outEvent = pointer.outEvent,
            outTarget = pointer.outTarget;

        if(outEvent && outTarget !== pEvent.target) {
            pEvent.relatedTarget = outTarget;
            outEvent.relatedTarget = pEvent.target;
            // recover from retargeting by shadow
            outEvent.target = outTarget;

            if(pEvent.target) {
                dispatcher.leaveOut(outEvent);
                dispatcher.enterOver(pEvent);
            } else {
                // clean up case when finger leaves the screen
                pEvent.target = outTarget;
                pEvent.relatedTarget = null;
                this.cancelOut(pEvent);
            }
        }

        pointer.outEvent = pEvent;
        pointer.outTarget = pEvent.target;
    },

    upOut : function(pEvent) {
        dispatcher.up(pEvent);
        dispatcher.out(pEvent);
        dispatcher.leave(pEvent);

        this.cleanUpPointer(pEvent);
    },

    cancelOut : function(pEvent) {
        dispatcher.cancel(pEvent);
        dispatcher.out(pEvent);
        dispatcher.leave(pEvent);
        this.cleanUpPointer(pEvent);
    },

    cleanUpPointer : function(pEvent) {
        pointerMap['delete'](pEvent.pointerId);
        this.removePrimaryPointer(pEvent);
    }
};

var msEvents = {
    events : [
        'MSPointerDown',
        'MSPointerMove',
        'MSPointerUp',
        'MSPointerOut',
        'MSPointerOver',
        'MSPointerCancel'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    POINTER_TYPES : [
        '',
        'unavailable',
        'touch',
        'pen',
        'mouse'
    ],

    prepareEvent : function(event) {
        var e = cloneEvent(event);
        HAS_BITMAP_TYPE && (e.pointerType = this.POINTER_TYPES[event.pointerType]);
        return e;
    },

    MSPointerDown : function(event) {
        pointerMap.set(event.pointerId, event);
        var e = this.prepareEvent(event);
        dispatcher.down(e);
    },

    MSPointerMove : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.move(e);
    },

    MSPointerUp : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.up(e);
        this.cleanup(event.pointerId);
    },

    MSPointerOut : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.leaveOut(e);
    },

    MSPointerOver : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.enterOver(e);
    },

    MSPointerCancel : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.cancel(e);
        this.cleanup(event.pointerId);
    },

    cleanup : function(id) {
        pointerMap['delete'](id);
    }
};

var navigator = window.navigator;
if(navigator.msPointerEnabled) {
    dispatcher.registerSource('ms', msEvents);
} else {
    dispatcher.registerSource('mouse', mouseEvents);
    if(typeof window.ontouchstart !== 'undefined') {
        dispatcher.registerSource('touch', touchEvents);
    }
}

dispatcher.register(doc);

}));

/* end: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointernative.js */
/* begin: ../../node_modules/bem-core/common.blocks/keyboard/__codes/keyboard__codes.js */
/**
 * @module keyboard__codes
 */
modules.define('keyboard__codes', function(provide) {

provide(/** @exports */{
    /** @type {Number} */
    BACKSPACE : 8,
    /** @type {Number} */
    TAB : 9,
    /** @type {Number} */
    ENTER : 13,
    /** @type {Number} */
    CAPS_LOCK : 20,
    /** @type {Number} */
    ESC : 27,
    /** @type {Number} */
    SPACE : 32,
    /** @type {Number} */
    PAGE_UP : 33,
    /** @type {Number} */
    PAGE_DOWN : 34,
    /** @type {Number} */
    END : 35,
    /** @type {Number} */
    HOME : 36,
    /** @type {Number} */
    LEFT : 37,
    /** @type {Number} */
    UP : 38,
    /** @type {Number} */
    RIGHT : 39,
    /** @type {Number} */
    DOWN : 40,
    /** @type {Number} */
    INSERT : 45,
    /** @type {Number} */
    DELETE : 46
});

});

/* end: ../../node_modules/bem-core/common.blocks/keyboard/__codes/keyboard__codes.js */
/* begin: ../../node_modules/bem-components/common.blocks/menu/__item/menu__item.js */
/**
 * @module menu__item
 */

modules.define('menu__item', ['i-bem-dom'], function(provide, bemDom) {

/**
 * @exports
 * @class menu__item
 * @bem
 *
 * @param val Value of item
 */
provide(bemDom.declElem('menu', 'item', /** @lends menu__item.prototype */{
    beforeSetMod : {
        'hovered' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this._domEvents().on('pointerleave', this._onPointerLeave);
            }
        },

        'disabled' : {
            'true' : function() {
                this
                    .delMod('hovered')
                    .domElem.attr('aria-disabled', true);
            },
            '' : function() {
                this.domElem.removeAttr('aria-disabled');
            }
        },

        'checked' : {
            '*' : function(_, modVal) {
                this.domElem.attr('aria-checked', !!modVal);
            }
        }
    },

    /**
     * Checks whether given value is equal to current value
     * @param {String|Number} val
     * @returns {Boolean}
     */
    isValEq : function(val) {
        // NOTE: String(true) == String(1) -> false
        return String(this.params.val) === String(val);
    },

    /**
     * Returns item value
     * @returns {*}
     */
    getVal : function() {
        return this.params.val;
    },

    /**
     * Returns item text
     * @returns {String}
     */
    getText : function() {
        return this.params.text || this.domElem.text();
    },

    _onPointerOver : function() {
        this.setMod('hovered');
    },

    _onPointerLeave : function() {
        this.delMod('hovered');
    },

    _onPointerClick : function() {
        this.hasMod('disabled') || this._emit('click', { source : 'pointer' });
    }
}, /** @lends menu__item */{
    lazyInit : true,
    onInit : function() {
        var ptp = this.prototype;

        this._domEvents()
            .on('pointerover', ptp._onPointerOver)
            .on('pointerclick', ptp._onPointerClick);
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/menu/__item/menu__item.js */
/* begin: ../../node_modules/bem-components/common.blocks/button/button.js */
/**
 * @module button
 */

modules.define(
    'button',
    ['i-bem-dom', 'control', 'jquery', 'dom', 'functions', 'keyboard__codes'],
    function(provide, bemDom, Control, $, dom, functions, keyCodes) {

/**
 * @exports
 * @class button
 * @augments control
 * @bem
 */
provide(bemDom.declBlock(this.name, Control, /** @lends button.prototype */{
    beforeSetMod : {
        'pressed' : {
            'true' : function() {
                return !this.hasMod('disabled') || this.hasMod('togglable');
            }
        },

        'focused' : {
            '' : function() {
                return !this._isPointerPressInProgress;
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._isPointerPressInProgress = false;
                this._focusedByPointer = false;
            }
        },

        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.hasMod('togglable') || this.delMod('pressed');
                this.domElem.attr('aria-disabled', true);
            },
            '' : function() {
                this.__base.apply(this, arguments);
                this.domElem.removeAttr('aria-disabled');
            }
        },

        'focused' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this._focusedByPointer || this.setMod('focused-hard');
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this.delMod('focused-hard');
            }
        }
    },

    /**
     * Returns text of the button
     * @returns {String}
     */
    getText : function() {
        return this._elem('text').domElem.text();
    },

    /**
     * Sets text to the button
     * @param {String} text
     * @returns {button} this
     */
    setText : function(text) {
        this._elem('text').domElem.text(text || '');
        return this;
    },

    _onFocus : function() {
        if(this._isPointerPressInProgress) return;

        this.__base.apply(this, arguments);
        this._domEvents('control').on('keydown', this._onKeyDown);
    },

    _onBlur : function() {
        this._domEvents('control').un('keydown', this._onKeyDown);
        this.__base.apply(this, arguments);
    },

    _onMouseDown : function(e) {
        e.preventDefault(); // NOTE: prevents button from being blurred at least in FF and Safari
        this._domEvents().un('mousedown', this._onMouseDown);
    },

    _onPointerPress : function() {
        this._domEvents().on('mousedown', this._onMouseDown);
        if(!this.hasMod('disabled')) {
            this._isPointerPressInProgress = true;
            this._domEvents(bemDom.doc).on('pointerrelease', this._onPointerRelease);
            this.setMod('pressed');
        }
    },

    _onPointerRelease : function(e) {
        this._isPointerPressInProgress = false;
        this._domEvents(bemDom.doc).un('pointerrelease', this._onPointerRelease);

        if(e.originalEvent.type === 'pointerup' && dom.contains(this.findMixedElem('control').domElem, $(e.target))) {
            this._focusedByPointer = true;
            this._focus();
            this._focusedByPointer = false;
            this._domEvents().once('pointerclick', this._onPointerClick);
        } else {
            this._blur();
        }

        this.delMod('pressed');
    },

    _onPointerClick : function() {
        this
            ._updateChecked()
            ._emit('click');
    },

    _onKeyDown : function(e) {
        if(this.hasMod('disabled')) return;

        var keyCode = e.keyCode;
        if(keyCode === keyCodes.SPACE || keyCode === keyCodes.ENTER) {
            this._domEvents('control')
                .un('keydown', this._onKeyDown)
                .on('keyup', this._onKeyUp);

            this._updateChecked()
                .setMod('pressed');
        }
    },

    _onKeyUp : function(e) {
        this._domEvents('control')
            .un('keyup', this._onKeyUp)
            .on('keydown', this._onKeyDown);

        this.delMod('pressed');

        e.keyCode === keyCodes.SPACE && this._doAction();

        this._emit('click');
    },

    _updateChecked : function() {
        this.hasMod('togglable') &&
            (this.hasMod('togglable', 'check')?
                this.toggleMod('checked') :
                this.setMod('checked'));

        return this;
    },

    _doAction : functions.noop
}, /** @lends button */{
    lazyInit : true,
    onInit : function() {
        this._domEvents('control').on('pointerpress', this.prototype._onPointerPress);
        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/button/button.js */
/* begin: ../../node_modules/bem-components/common.blocks/input/input.js */
/**
 * @module input
 */

modules.define('input', ['i-bem-dom', 'control'], function(provide, bemDom, Control) {

/**
 * @exports
 * @class input
 * @augments control
 * @bem
 */
provide(bemDom.declBlock(this.name, Control, /** @lends input.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._val = this._elem('control').domElem.val();
            }
        }
    },

    /**
     * Returns control value
     * @returns {String}
     * @override
     */
    getVal : function() {
        return this._val;
    },

    /**
     * Sets control value
     * @param {String} val value
     * @param {Object} [data] additional data
     * @returns {input} this
     */
    setVal : function(val, data) {
        val = String(val);

        if(this._val !== val) {
            this._val = val;

            var control = this._elem('control');
            control.domElem.val() !== val && control.domElem.val(val);

            this._emit('change', data);
        }

        return this;
    }
}, /** @lends input */{
    lazyInit : false,
    onInit : function() {
        this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/input/input.js */
/* begin: ../../node_modules/bem-components/desktop.blocks/input/input.js */
/**
 * @module input
 */

modules.define('input', ['i-bem-dom', 'tick', 'idle'], function(provide, bemDom, tick, idle, Input) {

var instances = [],
    boundToTick,
    bindToTick = function() {
        boundToTick = true;
        tick
            .on('tick', update)
            .start();
        idle
            .on({
                idle : function() {
                    tick.un('tick', update);
                },
                wakeup : function() {
                    tick.on('tick', update);
                }
            })
            .start();
    },
    update = function() {
        var instance, i = 0;
        while(instance = instances[i++]) {
            instance.setVal(instance._elem('control').domElem.val());
        }
    };

/**
 * @exports
 * @class input
 * @bem
 */
provide(bemDom.declBlock(Input, /** @lends input.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                boundToTick || bindToTick();

                // сохраняем индекс в массиве инстансов чтобы потом быстро из него удалять
                this._instanceIndex = instances.push(this) - 1;
            },

            '' : function() {
                this.__base.apply(this, arguments);

                // удаляем из общего массива instances
                instances.splice(this._instanceIndex, 1);
                // понижаем _instanceIndex всем тем кто был добавлен в instances после нас
                var i = this._instanceIndex, instance;
                while(instance = instances[i++]) --instance._instanceIndex;
            }
        }
    },

    /**
     * Нормализация установки фокуса для IE
     * @private
     * @override
     */
    _focus : function() {
        var input = this._elem('control').domElem[0];
        if(input.createTextRange && !input.selectionStart) {
            var range = input.createTextRange();
            range.move('character', input.value.length);
            range.select();
        } else {
            input.focus();
        }
    }
}));

});

/* end: ../../node_modules/bem-components/desktop.blocks/input/input.js */
/* begin: ../../node_modules/bem-core/common.blocks/tick/tick.vanilla.js */
/**
 * @module tick
 * @description Helpers for polling anything
 */

modules.define('tick', ['inherit', 'events'], function(provide, inherit, events) {

var TICK_INTERVAL = 50,
    global = this.global,

    /**
     * @class Tick
     * @augments events:Emitter
     */
    Tick = inherit(events.Emitter, /** @lends Tick.prototype */{
        /**
         * @constructor
         */
        __constructor : function() {
            this._timer = null;
            this._isStarted = false;
        },

        /**
         * Starts polling
         */
        start : function() {
            if(!this._isStarted) {
                this._isStarted = true;
                this._scheduleTick();
            }
        },

        /**
         * Stops polling
         */
        stop : function() {
            if(this._isStarted) {
                this._isStarted = false;
                global.clearTimeout(this._timer);
            }
        },

        _scheduleTick : function() {
            var _this = this;
            this._timer = global.setTimeout(
                function() {
                    _this._onTick();
                },
                TICK_INTERVAL);
        },

        _onTick : function() {
            this.emit('tick');

            this._isStarted && this._scheduleTick();
        }
    });

provide(
    /**
     * @exports
     * @type Tick
     */
    new Tick());

});

/* end: ../../node_modules/bem-core/common.blocks/tick/tick.vanilla.js */
/* begin: ../../node_modules/bem-core/common.blocks/idle/idle.js */
/**
 * @module idle
 */

modules.define('idle', ['inherit', 'events', 'jquery'], function(provide, inherit, events, $) {

var IDLE_TIMEOUT = 3000,
    USER_EVENTS = 'mousemove keydown click',
    /**
     * @class Idle
     * @augments events:Emitter
     */
    Idle = inherit(events.Emitter, /** @lends Idle.prototype */{
        /**
         * @constructor
         */
        __constructor : function() {
            this._timer = null;
            this._isStarted = false;
            this._isIdle = false;
        },

        /**
         * Starts monitoring of idle state
         */
        start : function() {
            if(!this._isStarted) {
                this._isStarted = true;
                this._startTimer();
                $(document).on(USER_EVENTS, $.proxy(this._onUserAction, this));
            }
        },

        /**
         * Stops monitoring of idle state
         */
        stop : function() {
            if(this._isStarted) {
                this._isStarted = false;
                this._stopTimer();
                $(document).off(USER_EVENTS, this._onUserAction);
            }
        },

        /**
         * Returns whether state is idle
         * @returns {Boolean}
         */
        isIdle : function() {
            return this._isIdle;
        },

        _onUserAction : function() {
            if(this._isIdle) {
                this._isIdle = false;
                this.emit('wakeup');
            }

            this._stopTimer();
            this._startTimer();
        },

        _startTimer : function() {
            var _this = this;
            this._timer = setTimeout(
                function() {
                    _this._onTimeout();
                },
                IDLE_TIMEOUT);
        },

        _stopTimer : function() {
            this._timer && clearTimeout(this._timer);
        },

        _onTimeout : function() {
            this._isIdle = true;
            this.emit('idle');
        }
    });

provide(
    /**
     * @exports
     * @type Idle
     */
    new Idle());

});

/* end: ../../node_modules/bem-core/common.blocks/idle/idle.js */
/* begin: ../../desktop.blocks/slider/slider.js */
modules.define('slider', ['i-bem-dom', 'button'], function(provide, bemDom, Button){
  provide(bemDom.declBlock(this.name, {
  	
  	onSetMod: {
  	  'js' : {
  	  	'inited' : function(modName, modVal) {
  	  	  this._buttonsPrev = this.findChildBlocks({ block: Button, modName: 'arrow', modVal: 'arrow-prev' });
          this._events(this._buttonsPrev).on('click', this._showPrevSlide);
  	  	  
          this._buttonsNext = this.findChildBlocks({ block: Button, modName: 'arrow', modVal: 'arrow-next' });
          this._events(this._buttonsNext).on('click', this._showNextSlide);
         
          this._items = this.findChildElems('item');
  	  	}
  	  }
  	},

    _showPrevSlide: function(){
      let indexOfShownSlide = this._hideShownSlide();

      if(indexOfShownSlide == 0) {
      	let indexOfPrevSlide = this._items.size() - 1;
      	this._showSlide(indexOfPrevSlide);
      } else {
        let indexOfPrevSlide = indexOfShownSlide - 1;
      	this._showSlide(indexOfPrevSlide);
      }
    },

    _showNextSlide: function() {
      let indexOfShownSlide = this._hideShownSlide();

      if(indexOfShownSlide == (this._items.size() - 1)) {
      	let indexOfNextSlide = 0;
      	this._showSlide(indexOfNextSlide);
      } else {
        let indexOfNextSlide = indexOfShownSlide + 1;
      	this._showSlide(indexOfNextSlide);
      }
    },

    _hideShownSlide: function(){
      let shownSlide = this._items.find((elem)=>{
        if(elem.hasMod('disabled', false)) {
        	return elem;
        }
      });
      let indexOfShownSlide = shownSlide.domElem.index();
      shownSlide.setMod('disabled', true);

      return indexOfShownSlide;
    },
    _showSlide: function(index) {
      this._items.get(index).setMod('disabled', false);
    }
  }));
});


/* end: ../../desktop.blocks/slider/slider.js */
/* begin: ../../desktop.blocks/input/_has-calendar/input_has-calendar.js */
/**
 * @module input
 */
modules.define('input', ['i-bem-dom', 'jquery', 'dom', 'calendar', 'popup'], function(provide, bemDom, $, dom, Calendar, Popup, Input) {

/**
 * @exports
 * @class input
 * @augments control
 * @bem
 */
provide(Input.declMod({ modName: 'has-calendar', modVal: true }, /** @lends input.prototype */{
    beforeSetMod: {
        focused: {
            '': function() {
                this.__base.apply(this, arguments);

                if(this._ignoreBlur) {
                    this._ignoreBlur = false;
                    return false;
                }
            }
        }
    },
    onSetMod: {
        js: {
            inited: function() {
                this.__base.apply(this, arguments);

                this._popup = this.findChildBlock(Popup);
                this._setAnchor(this.domElem);

                this._calendar = this.findChildBlock(Calendar)
                    .setVal(this.getVal());

                this._events(this._calendar).on('change', function(e, data) {
                    this
                        .setVal(data.formated)
                        .hideCalendar();
                });
            },
            '': function() {
                bemDom.destruct(this._calendar.domElem);
                this.__base.apply(this, arguments);
            }
        },
        focused: {
            'true': function() {
                this.__base.apply(this, arguments);

                this._domEvents().on('pointerclick', this._onPointerclick);
                this._domEvents(bemDom.doc).on('pointerdown', this._onOutsideClick);

                if(this._wasIconCliked) {
                    this._wasIconCliked = false;

                    this._wasShown ?
                        this.hideCalendar() :
                        this.showCalendar();

                } else {
                    this.isCalendarShown() || this.showCalendar();
                }
            },
            '': function() {
                this.__base.apply(this, arguments);

                this._domEvents().un('pointerclick', this._onPointerclick);
                this._domEvents(bemDom.doc).un('pointerdown', this._onOutsideClick);

                this.hideCalendar();
            }
        }
    },
    _onOutsideClick: function(e) {
        var target = $(e.target),
            isInsideCalendar = dom.contains(this._popup.domElem, target);

        this._wasShown = e.target === this._elem('calendar').domElem[0] && this.isCalendarShown();

        this._ignoreBlur = isInsideCalendar;

        isInsideCalendar || this.delMod('focused');

    },
    _onPointerclick: function() {
        this.__base.apply(this, arguments);

        if(this.hasMod('disabled')) return;

        this.showCalendar();
    },
    _onCalendarIconClick: function() {
        this._wasIconCliked = true;
        this.setMod('focused');
    },
    /**
     * Is calendar shown?
     *
     * @returns {boolean}
     */
    isCalendarShown: function() {
        return this._popup.hasMod('visible');
    },

    /**
     * Set target
     *
     * @param {jQuery|Function} anchor - DOM elem or anchor Bem block.
     * @returns {input} this
     */
    _setAnchor: function(anchor) {
        this._popup.setAnchor(anchor);
        return this;
    },

    /**
     * Show calendar
     *
     * @returns {input} this
     */
    showCalendar: function() {
        this._calendar._build();
        this._popup.setMod('visible');

        return this;
    },

    /**
     * Hide calendar
     *
     * @returns {input} this
     */
    hideCalendar: function() {
        this._popup.delMod('visible');

        return this;
    },

    /**
     * Sets directions for calendar.
     *
     * @param {Array<String>} directions - @see Popup.directions
     * @returns {input} this
     */
    setCalendarDirections: function(directions) {
        this._popup.params.directions = directions;
        return this;
    }
}, {
    onInit: function() {
        this._domEvents('calendar').on('pointerclick', this.prototype._onCalendarIconClick);

        this.__base.apply(this, arguments);
    }
}));

});
/* end: ../../desktop.blocks/input/_has-calendar/input_has-calendar.js */
/* begin: ../../node_modules/bem-components/common.blocks/popup/popup.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem-dom'],
    function(provide, bemDom) {

var ZINDEX_FACTOR = 1000,
    visiblePopupsZIndexes = {},
    undef;

/**
 * @exports
 * @class popup
 * @bem
 *
 * @param {Number} [zIndexGroupLevel=0] z-index group level
 *
 * @bemmod visible Represents visible state
 */
provide(bemDom.declBlock(this.name, /** @lends popup.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this._parentPopup = undef;
                this._zIndex = null;
                this._zIndexGroupLevel = null;
                this._isAttachedToScope = false;
            },

            '' : function() {
                this.delMod('visible');
            }
        },

        'visible' : {
            'true' : function() {
                if(!this._isAttachedToScope) {
                    bemDom.scope.append(this.domElem);
                    this._isAttachedToScope = true;
                }

                this
                    ._captureZIndex()
                    ._bindToParentPopup()
                    ._domEvents().on('pointerpress pointerclick', this._setPreventHideByClick);

                this.domElem.removeAttr('aria-hidden');
            },

            '' : function() {
                this
                    ._releaseZIndex()
                    ._unbindFromParentPopup()
                    ._domEvents().un('pointerpress pointerclick', this._setPreventHideByClick);

                this.domElem.attr('aria-hidden', true);
            }
        }
    },

    /**
     * Sets content
     * @param {String|jQuery} content
     * @returns {popup} this
     */
    setContent : function(content) {
        bemDom.update(this.domElem, content);
        return this;
    },

    _calcZIndexGroupLevel : function() {
        var res = this.params.zIndexGroupLevel,
            parentPopup = this._getParentPopup();

        parentPopup && (res += parentPopup._zIndexGroupLevel);

        return res;
    },

    _setPreventHideByClick : function() {
        var curPopup = this;
        do {
            curPopup._preventHideByClick = true;
        } while(curPopup = curPopup._getParentPopup());
    },

    _bindToParentPopup : function() {
        var parentPopup = this._getParentPopup();
        parentPopup &&
            this._events(parentPopup).on({ modName : 'visible', modVal : '' }, this._onParentPopupHide, this);

        return this;
    },

    _unbindFromParentPopup : function() {
        this._parentPopup && this._events(this._parentPopup)
            .un({ modName : 'visible', modVal : '' }, this._onParentPopupHide, this);

        this._parentPopup = undef;

        return this;
    },

    _onParentPopupHide : function() {
        this.delMod('visible');
    },

    _getParentPopup : function() {
        return this._parentPopup;
    },

    _captureZIndex : function() {
        var level = this._zIndexGroupLevel === null?
                this._zIndexGroupLevel = this._calcZIndexGroupLevel() :
                this._zIndexGroupLevel,
            zIndexes = visiblePopupsZIndexes[level] || (visiblePopupsZIndexes[level] = [(level + 1) * ZINDEX_FACTOR]),
            prevZIndex = this._zIndex;

        this._zIndex = zIndexes[zIndexes.push(zIndexes[zIndexes.length - 1] + 1) - 1];
        this._zIndex !== prevZIndex && this.domElem.css('z-index', this._zIndex);

        return this;
    },

    _releaseZIndex : function() {
        var zIndexes = visiblePopupsZIndexes[this._zIndexGroupLevel];
        zIndexes.splice(zIndexes.indexOf(this._zIndex), 1);

        return this;
    },

    _recaptureZIndex : function() {
        this._releaseZIndex();
        this._zIndexGroupLevel = null;

        return this._captureZIndex();
    },

    _getDefaultParams : function() {
        return {
            zIndexGroupLevel : 0
        };
    }
}, /** @lends popup */{
    lazyInit : true
}));

});

/* end: ../../node_modules/bem-components/common.blocks/popup/popup.js */
/* begin: ../../node_modules/bem-core/common.blocks/functions/__throttle/functions__throttle.vanilla.js */
/**
 * @module functions__throttle
 */

modules.define('functions__throttle', function(provide) {

var global = this.global;

provide(
    /**
     * Throttle given function
     * @exports
     * @param {Function} fn function to throttle
     * @param {Number} timeout throttle interval
     * @param {Boolean} [invokeAsap=true] invoke before first interval
     * @param {Object} [ctx] context of function invocation
     * @returns {Function} throttled function
     */
    function(fn, timeout, invokeAsap, ctx) {
        var typeofInvokeAsap = typeof invokeAsap;
        if(typeofInvokeAsap === 'undefined') {
            invokeAsap = true;
        } else if(arguments.length === 3 && typeofInvokeAsap !== 'boolean') {
            ctx = invokeAsap;
            invokeAsap = true;
        }

        var timer, args, needInvoke,
            wrapper = function() {
                if(needInvoke) {
                    fn.apply(ctx, args);
                    needInvoke = false;
                    timer = global.setTimeout(wrapper, timeout);
                } else {
                    timer = null;
                }
            };

        return function() {
            args = arguments;
            ctx || (ctx = this);
            needInvoke = true;

            if(!timer) {
                invokeAsap?
                    wrapper() :
                    timer = global.setTimeout(wrapper, timeout);
            }
        };
    });

});

/* end: ../../node_modules/bem-core/common.blocks/functions/__throttle/functions__throttle.vanilla.js */
/* begin: ../../node_modules/bem-components/common.blocks/popup/_target/popup_target.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem-dom', 'objects'],
    function(provide, bemDom, objects, Popup) {

var VIEWPORT_ACCURACY_FACTOR = 0.99,
    DEFAULT_DIRECTIONS = [
        'bottom-left', 'bottom-center', 'bottom-right',
        'top-left', 'top-center', 'top-right',
        'right-top', 'right-center', 'right-bottom',
        'left-top', 'left-center', 'left-bottom'
    ],

    win = bemDom.win,
    undef;

/**
 * @exports
 * @class popup
 * @bem
 *
 * @param {Number} [mainOffset=0] offset along the main direction
 * @param {Number} [secondaryOffset=0] offset along the secondary direction
 * @param {Number} [viewportOffset=0] offset from the viewport (window)
 * @param {Array[String]} [directions] allowed directions
 */
provide(Popup.declMod({ modName : 'target', modVal : '*' }, /** @lends popup.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                this._lastDrawingCss = {
                    left : undef,
                    top : undef,
                    zIndex : undef,
                    display : undef
                };
            }
        },

        'visible' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this._domEvents(win).on('scroll resize', this._onWinScrollAndResize);
                this.redraw();
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this._domEvents(win).un('scroll resize', this._onWinScrollAndResize);
            }
        }
    },

    /**
     * @override
     */
    setContent : function() {
        return this.__base.apply(this, arguments).redraw();
    },

    /**
     * Redraws popup
     * @returns {popup} this
     */
    redraw : function() {
        if(!this.hasMod('visible')) return this;

        var bestDrawingParams = this._calcBestDrawingParams();

        this.setMod('direction', bestDrawingParams.direction);

        var lastDrawingCss = this._lastDrawingCss,
            needUpdateCss = false;

        objects.each(
            this._calcDrawingCss(bestDrawingParams),
            function(val, name) {
                if(lastDrawingCss[name] !== val) {
                    lastDrawingCss[name] = val;
                    needUpdateCss = true;
                }
            });

        needUpdateCss && this.domElem.css(lastDrawingCss);

        return this;
    },

    _calcDrawingCss : function(drawingParams) {
        return {
            left : drawingParams.left,
            top : drawingParams.top
        };
    },

    /**
     * Returns possible directions to draw with max available width and height.
     * @returns {Array}
     */
    calcPossibleDrawingParams : function() {
        var target = this._calcTargetDimensions(),
            viewport = this._calcViewportDimensions(),
            params = this.params,
            mainOffset = params.mainOffset,
            secondaryOffset = params.secondaryOffset,
            viewportOffset = params.viewportOffset;

        return this.params.directions.map(function(direction) {
            var subRes = {
                    direction : direction,
                    width : 0,
                    height : 0,
                    left : 0,
                    top : 0
                };

            if(this._checkMainDirection(direction, 'bottom')) {
                subRes.top = target.top + target.height + mainOffset;
                subRes.height = viewport.bottom - subRes.top - viewportOffset;
            } else if(this._checkMainDirection(direction, 'top')) {
                subRes.height = target.top - viewport.top - mainOffset - viewportOffset;
                subRes.top = target.top - subRes.height - mainOffset;
            } else {
                if(this._checkSecondaryDirection(direction, 'center')) {
                    subRes.height = viewport.bottom - viewport.top - 2 * viewportOffset;
                    subRes.top = target.top + target.height / 2 - subRes.height / 2;
                } else if(this._checkSecondaryDirection(direction, 'bottom')) {
                    subRes.height = target.top + target.height - viewport.top - secondaryOffset - viewportOffset;
                    subRes.top = target.top + target.height - subRes.height - secondaryOffset;
                } else if(this._checkSecondaryDirection(direction, 'top')) {
                    subRes.top = target.top + secondaryOffset;
                    subRes.height = viewport.bottom - subRes.top - viewportOffset;
                }

                if(this._checkMainDirection(direction, 'left')) {
                    subRes.width = target.left - viewport.left - mainOffset - viewportOffset;
                    subRes.left = target.left - subRes.width - mainOffset;
                } else {
                    subRes.left = target.left + target.width + mainOffset;
                    subRes.width = viewport.right - subRes.left - viewportOffset;
                }
            }

            if(this._checkSecondaryDirection(direction, 'right')) {
                subRes.width = target.left + target.width - viewport.left - secondaryOffset - viewportOffset;
                subRes.left = target.left + target.width - subRes.width - secondaryOffset;
            } else if(this._checkSecondaryDirection(direction, 'left')) {
                subRes.left = target.left + secondaryOffset;
                subRes.width = viewport.right - subRes.left - viewportOffset;
            } else if(this._checkSecondaryDirection(direction, 'center')) {
                if(this._checkMainDirection(direction, 'top', 'bottom')) {
                    subRes.width = viewport.right - viewport.left - 2 * viewportOffset;
                    subRes.left = target.left + target.width / 2 - subRes.width / 2;
                }
            }

            return subRes;
        }, this);
    },

    _calcBestDrawingParams : function() {
        var popup = this._calcPopupDimensions(),
            target = this._calcTargetDimensions(),
            viewport = this._calcViewportDimensions(),
            directions = this.params.directions,
            i = 0,
            direction,
            pos,
            viewportFactor,
            bestDirection,
            bestPos,
            bestViewportFactor;

        while(direction = directions[i++]) {
            pos = this._calcPos(direction, target, popup);
            viewportFactor = this._calcViewportFactor(pos, viewport, popup);
            if(i === 1 ||
                    viewportFactor > bestViewportFactor ||
                    (!bestViewportFactor && this.hasMod('direction', direction))) {
                bestDirection = direction;
                bestViewportFactor = viewportFactor;
                bestPos = pos;
            }
            if(bestViewportFactor > VIEWPORT_ACCURACY_FACTOR) break;
        }

        return {
            direction : bestDirection,
            left : bestPos.left,
            top : bestPos.top
        };
    },

    _calcPopupDimensions : function() {
        var popupWidth = this.domElem.outerWidth(),
            popupHeight = this.domElem.outerHeight();

        return {
            width : popupWidth,
            height : popupHeight,
            area : popupWidth * popupHeight
        };
    },

    /**
     * @abstract
     * @protected
     * @returns {Object}
     */
    _calcTargetDimensions : function() {},

    _calcViewportDimensions : function() {
        var winTop = win.scrollTop(),
            winLeft = win.scrollLeft(),
            winWidth = win.width(),
            winHeight = win.height();

        return {
            top : winTop,
            left : winLeft,
            bottom : winTop + winHeight,
            right : winLeft + winWidth
        };
    },

    _calcPos : function(direction, target, popup) {
        var res = {},
            mainOffset = this.params.mainOffset,
            secondaryOffset = this.params.secondaryOffset;

        if(this._checkMainDirection(direction, 'bottom')) {
            res.top = target.top + target.height + mainOffset;
        } else if(this._checkMainDirection(direction, 'top')) {
            res.top = target.top - popup.height - mainOffset;
        } else if(this._checkMainDirection(direction, 'left')) {
            res.left = target.left - popup.width - mainOffset;
        } else if(this._checkMainDirection(direction, 'right')) {
            res.left = target.left + target.width + mainOffset;
        }

        if(this._checkSecondaryDirection(direction, 'right')) {
            res.left = target.left + target.width - popup.width - secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'left')) {
            res.left = target.left + secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'bottom')) {
            res.top = target.top + target.height - popup.height - secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'top')) {
            res.top = target.top + secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'center')) {
            if(this._checkMainDirection(direction, 'top', 'bottom')) {
                res.left = target.left + target.width / 2 - popup.width / 2;
            } else if(this._checkMainDirection(direction, 'left', 'right')) {
                res.top = target.top + target.height / 2 - popup.height / 2;
            }
        }

        return res;
    },

    _calcViewportFactor : function(pos, viewport, popup) {
        var viewportOffset = this.params.viewportOffset,
            intersectionLeft = Math.max(pos.left, viewport.left + viewportOffset),
            intersectionRight = Math.min(pos.left + popup.width, viewport.right - viewportOffset),
            intersectionTop = Math.max(pos.top, viewport.top + viewportOffset),
            intersectionBottom = Math.min(pos.top + popup.height, viewport.bottom - viewportOffset);

        return intersectionLeft < intersectionRight && intersectionTop < intersectionBottom? // has intersection
            (intersectionRight - intersectionLeft) *
                (intersectionBottom - intersectionTop) /
                popup.area :
            0;
    },

    _checkMainDirection : function(direction, mainDirection1, mainDirection2) {
        return !direction.indexOf(mainDirection1) || (mainDirection2 && !direction.indexOf(mainDirection2));
    },

    _checkSecondaryDirection : function(direction, secondaryDirection) {
        return ~direction.indexOf('-' + secondaryDirection);
    },

    _onWinScrollAndResize : function() {
        this.redraw();
    },

    _getDefaultParams : function() {
        return objects.extend(
            this.__base.apply(this, arguments),
            {
                mainOffset : 0,
                secondaryOffset : 0,
                viewportOffset : 0,
                directions : DEFAULT_DIRECTIONS
            });
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/popup/_target/popup_target.js */
/* begin: ../../node_modules/bem-components/common.blocks/z-index-group/z-index-group.js */
modules.define('z-index-group', ['i-bem-dom'], function(provide, bemDom) {

provide(bemDom.declBlock(this.name));

});

/* end: ../../node_modules/bem-components/common.blocks/z-index-group/z-index-group.js */
/* begin: ../../desktop.blocks/calendar/calendar.js */
/**
 * @module calendar
 */
modules.define('calendar', ['i-bem-dom', 'BEMHTML', 'jquery'], function(provide, bemDom, BEMHTML, $) {

function compareMonths(a, b) {
    return (a.getFullYear() - b.getFullYear()) * 100 + a.getMonth() - b.getMonth();
}

function leadZero(num) {
    return num < 10 ? '0' + num : num;
}

/**
 * @exports
 * @class Calendar
 * @bem
 */
provide(bemDom.declBlock(this.name, /** @lends calendar.prototype */{
    onSetMod: {
        js: {
            inited: function() {
                this._val = null;
                this._selectedDayElem = null;
                this._firstDayIndex = -1;
                var today = this._getToday(),
                    params = this.params;

                this._month = today;
                this._month.setDate(1);

                this.setLimits(params.earlierLimit, params.laterLimit);

                this.setVal(this._isValidDate(params.val) ? params.val : today);

                if(!this._elem('container')) {
                    this._build();
                }

            }
        }
    },

    /**
     * Get value
     *
     * @returns {?Date}
     */
    getVal: function() {
        return this._val;
    },

    /**
     * Set value
     *
     * @param {Date|String} val - Date or date as string
     * @returns {Calendar} this
     */
    setVal: function(val) {
        var date = this.parseDate(val);
        this._val = this._isValidDate(date) ? date : null;

         if(this._val) {
            var shouldRebuild = this._month.getMonth() !== date.getMonth() ||
                                this._month.getFullYear() !== date.getFullYear();

            this._month = new Date(this._val.getTime());
            this._month.setDate(1);

            if(!this._elem('container') || shouldRebuild) {
                this._build();
            } else {
                this._selectDayElem(
                    this._elems('day')
                        .get(this._firstDayIndex + this._val.getDate() - 1)
                );
            }

            this._emit('change', {
                value: this._val,
                formated: this._formatDate(this._val)
            });
        }
        return this;
    },

    /**
     * Switch month
     *
     * @param {Number} step - Months count
     * @returns {calendar} this
     */
    switchMonth: function(step) {
        this._month.setMonth(this._month.getMonth() + step);

        this._nextTick(this._build);

        return this;
    },
    /**
     * Parse date
     *
     * @param {Date|String} val - Date or date as string
     * @returns {?Date}
     */
    parseDate: function(val) {
        if(val instanceof Date) return val;

        var parsed = this._parseDateParts(val);
        if(parsed) {
            var day = parsed.day,
                month = parsed.month,
                year = parsed.year,
                date = this._getToday();

            date.setMonth(month, day);

            if(year) {
                date.setFullYear(year);
            }

            return date;
        }

        return null;
    },

    /**
     * Sets limits
     *
     * @param {Date|String} [earlier] - left limit
     * @param {Date|String} [later] - right limit
     * @returns {calendar} this
     */
    setLimits: function(earlier, later) {
        this._earlierLimit = this.parseDate(earlier);
        this._laterLimit = this.parseDate(later);

        if(earlier && compareMonths(this._month, this._earlierLimit) < 0) {
            this._month = new Date(this._earlierLimit.getTime());
        }

        if(later && compareMonths(this._laterLimit, this._month) < 0) {
            this._month = new Date(this._laterLimit.getTime());
        }

        this._month.setDate(1);

        return this;
    },
    /**
     * @typedef {object} DateHash
     *
     * @param {Number|String} day
     * @param {Number|String} month
     * @param {Number|String} year
     */

    /**
     * Parses string date
     *
     * @param {Date|String} [str] - input date
     * @returns {?DateHash} output date
     */
    _parseDateParts: function(str) {
        var match = /^\s*(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d\d))?\s*$/.exec(str);

        if(match) {
            return {
                day: match[1],
                month: match[2] - 1,
                year: match[3]
            };
        }

        match = /^\s*(\d{4})[./-](\d\d)(?:[./-](\d\d))?\s*$/.exec(str);

        if(match) {
            return {
                day: match[3],
                month: match[2] - 1,
                year: match[1]
            };
        }

        return null;
    },
    _getToday: function() {
        var today = new Date();
        today.setHours(0, 0, 0, 0);

        return today;
    },

    _formatDate: function(date) {
        var year = date.getFullYear(),
            month = date.getMonth() + 1,
            day = date.getDate();

        return [leadZero(day), leadZero(month), year].join('.');
    },

    _isValidDate: function(date) {
        return !(this._earlierLimit && date < this._earlierLimit ||
            this._laterLimit && date > this._laterLimit);
    },
    _isWeekend: function(dayNumber) {
        return dayNumber > 4;
    },
    _build: function() {
        var rows = [];
        rows.push(this._buildShortWeekdays());
        rows = rows.concat(this._buildMonth(this._month));

        var calendar = $(BEMHTML.apply({
            block: 'calendar',
            elem: 'container',
            content: [
                this._buildTitle(this._month),
                {
                    elem: 'layout',
                    tag: 'table',
                    content: rows.map(function(row) {
                        return {
                            elem: 'row',
                            tag: 'tr',
                            content: row
                        };
                    })
                }
            ]
        }));
        bemDom.update(this.domElem, calendar);
        this._selectedDayElem = this.findChildElem({ elem: 'day', modName: 'state', modVal: 'current' });
    },

    _calcWeeks: function(month) {
        var weekDay,
            weeks = [],
            countDays = 7,
            lastDay = 6,
            week = new Array(countDays),
            dateIterator = new Date(month.getTime());

        for(
            dateIterator.setDate(1);
            dateIterator.getMonth() === month.getMonth();
            dateIterator.setDate(dateIterator.getDate() + 1)
        ) {
            var iterationResult = this._processWeek(dateIterator, week, weeks, lastDay, countDays);
            week = iterationResult.week;
            weekDay = iterationResult.weekDay;
        }

        if(weekDay !== lastDay) {
            weeks.push(week);
        }

        return weeks;
    },
    _processWeek: function(dateIterator, week, weeks, lastDay, countDays) {
        var weekDay = (dateIterator.getDay() + lastDay) % countDays; // Получаем 0 - пн, 1 - вт, и т.д.

        week[weekDay] = new Date(dateIterator.getTime());

        if(weekDay === lastDay) {
            weeks.push(week);
            week = new Array(countDays);
        }
        return { week: week, weekDay: weekDay };
    },
    _buildMonth: function(month) {
        var rows = [],
            today = this._getToday();
        this._calcWeeks(month).forEach(function(week) {
            var row = [],
                _this = this;
            $.each(week, function(i, day) {
                var off = !_this._isValidDate(day),
                    val = _this.getVal(),
                    weekend = _this._isWeekend(i),
                    dayElem = {
                        elem: 'day',
                        tag: 'td',
                        content: {
                            elem: 'inner',
                            content: day ? day.getDate() : ''
                        },
                        attrs: {},
                        elemMods: {}
                    };

                if(day && !off) {
                    dayElem.attrs['data-day'] = _this._formatDate(day);
                    if(_this._firstDayIndex === -1) {
                        _this._firstDayIndex = i;
                    }
                }

                if(weekend) {
                    dayElem.elemMods.type = off ? 'weekend-off' : 'weekend';
                } else if(off) {
                    dayElem.elemMods.type = 'off';
                }

                if(day) {
                    var time = day.getTime();

                    if(val && time === val.getTime()) {
                        dayElem.elemMods.state = 'current';
                    }

                    dayElem.elemMods.today = time === today.getTime();
                }

                row.push(dayElem);
            });

            rows.push(row);
        }, this);

        return rows;
    },
    _buildShortWeekdays: function() {
        var row = [];

        this.params.weekdays.forEach(function(name, i) {
            var dayname = {
                elem: 'dayname',
                tag: 'th',
                content: name
            };

            if(this._isWeekend(i)) {
                dayname.elemMods = { type: 'weekend' };
            }

            row.push(dayname);
        }, this);

        return row;
    },

    _buildTitle: function(month) {
        var prevMonth = !this._earlierLimit || compareMonths(month, this._earlierLimit) > 0,
            nextMonth = !this._laterLimit || compareMonths(this._laterLimit, month) > 0;

        return {
            elem: 'title',
            content: [
                {
                    elem: 'arrow',
                    elemMods: {
                        direction: 'left',
                        disabled: !prevMonth
                    }
                },
                {
                    elem: 'arrow',
                    elemMods: {
                        direction: 'right',
                        disabled: !nextMonth
                    }
                },
                {
                    elem: 'name',
                    content: this.params.months[month.getMonth()] +
                        ' ' + month.getFullYear()
                }
            ]
        };
    },

    _onArrowClick: function(e) {
        var arrow = e.bemTarget;
        if(!arrow.hasMod('disabled')) {
            this.switchMonth(arrow.hasMod('direction', 'left') ? -1 : 1);
        }

    },

    _onDayClick: function(e) {
        var date = $(e.currentTarget).data('day');
        if(!date) return;

        this.setVal(date);
    },

    _selectDayElem: function(element) {
        if(this._selectedDayElem) {
            this._selectedDayElem.delMod('state');
        }
        element.setMod('state', 'current');
        this._selectedDayElem = element;
    }
},  /** @lends calendar */ {
    lazyInit: false,

    onInit: function() {
        this._domEvents('arrow').on('pointerclick', this.prototype._onArrowClick);
        this._domEvents('day').on('pointerclick', this.prototype._onDayClick);
    }
}));

});
/* end: ../../desktop.blocks/calendar/calendar.js */
/* begin: ../../desktop.blocks/content/__holidays/content__holidays.js */
modules.define('content__item', ['i-bem-dom'], function(provide, bemDom) {
  provide(bemDom.declElem('content', 'item', {
  	onSetMod: {
  	  'js' : {
  	  	'inited' : function(){         
  	  	  this._domEvents().on('click', this._onClick);
  	  	}
  	  }
  	},
  	_onClick: function() {
  	  if(this.hasMod('status', 'active')) {
  	  	this.delMod('status');
  	  }
  	  else {
  	  	this.setMod('status', 'active');
  	  }
  	}
  }))
}
);

/* end: ../../desktop.blocks/content/__holidays/content__holidays.js */
/* begin: ../../node_modules/bem-core/common.blocks/loader/_type/loader_type_js.js */
/**
 * @module loader_type_js
 * @description Load JS from external URL.
 */

modules.define('loader_type_js', function(provide) {

var loading = {},
    loaded = {},
    head = document.getElementsByTagName('head')[0],
    runCallbacks = function(path, type) {
        var cbs = loading[path], cb, i = 0;
        delete loading[path];
        while(cb = cbs[i++]) {
            cb[type] && cb[type]();
        }
    },
    onSuccess = function(path) {
        loaded[path] = true;
        runCallbacks(path, 'success');
    },
    onError = function(path) {
        runCallbacks(path, 'error');
    };

provide(
    /**
     * @exports
     * @param {String} path resource link
     * @param {Function} [success] to be called if the script succeeds
     * @param {Function} [error] to be called if the script fails
     */
    function(path, success, error) {
        if(loaded[path]) {
            success && success();
            return;
        }

        if(loading[path]) {
            loading[path].push({ success : success, error : error });
            return;
        }

        loading[path] = [{ success : success, error : error }];

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = (location.protocol === 'file:' && !path.indexOf('//')? 'http:' : '') + path;

        if('onload' in script) {
            script.onload = function() {
                script.onload = script.onerror = null;
                onSuccess(path);
            };

            script.onerror = function() {
                script.onload = script.onerror = null;
                onError(path);
            };
        } else {
            script.onreadystatechange = function() {
                var readyState = this.readyState;
                if(readyState === 'loaded' || readyState === 'complete') {
                    script.onreadystatechange = null;
                    onSuccess(path);
                }
            };
        }

        head.insertBefore(script, head.lastChild);
    }
);

});

/* end: ../../node_modules/bem-core/common.blocks/loader/_type/loader_type_js.js */
/* begin: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/_type/i-bem-dom__events_type_dom.js */
/**
 * @module i-bem-dom__events_type_dom
 */
modules.define(
    'i-bem-dom__events_type_dom',
    [
        'i-bem-dom__events',
        'inherit',
        'jquery'
    ],
    function(
        provide,
        bemDomEvents,
        inherit,
        $) {

var eventBuilder = function(e) {
        return e;
    },
    /**
     * @class EventManagerFactory
     * @augments i-bem-dom__events:EventManagerFactory
     * @exports i-bem-dom__events_type_dom:EventManagerFactory
     */
    EventManagerFactory = inherit(bemDomEvents.EventManagerFactory,/** @lends EventManagerFactory.prototype */{
        /** @override */
        _createEventManager : function(ctx, params, isInstance) {
            function wrapperFn(fn) {
                return function(e) {
                    var instance;

                    if(isInstance) {
                        instance = ctx;
                    } else {
                        // TODO: we could optimize all these "closest" to a single traversing
                        var entityDomNode = $(e.target).closest(params.ctxSelector);
                        entityDomNode.length && (instance = entityDomNode.bem(ctx));
                    }

                    if(instance) {
                        params.bindEntityCls && (e.bemTarget = $(this).bem(params.bindEntityCls));
                        fn.apply(instance, arguments);
                    }
                };
            }

            return new this._eventManagerCls(params, wrapperFn, eventBuilder);
        }
    });

provide({ EventManagerFactory : EventManagerFactory });

});

/* end: ../../node_modules/bem-core/common.blocks/i-bem-dom/__events/_type/i-bem-dom__events_type_dom.js */
/* begin: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerpressrelease.js */
modules.define('jquery', function(provide, $) {

$.each({
    pointerpress : 'pointerdown',
    pointerrelease : 'pointerup pointercancel'
}, function(fix, origEvent) {
    function eventHandler(e) {
        if(e.which === 1) {
            var fixedEvent = cloneEvent(e);
            fixedEvent.type = fix;
            fixedEvent.originalEvent = e;
            return $.event.dispatch.call(this, fixedEvent);
        }
    }

    $.event.special[fix] = {
        setup : function() {
            $(this).on(origEvent, eventHandler);
            return false;
        },
        teardown : function() {
            $(this).off(origEvent, eventHandler);
            return false;
        }
    };
});

function cloneEvent(event) {
    var eventCopy = $.extend(new $.Event(), event);
    if(event.preventDefault) {
        eventCopy.preventDefault = function() {
            event.preventDefault();
        };
    }
    return eventCopy;
}

provide($);

});

/* end: ../../node_modules/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerpressrelease.js */
/* begin: ../../node_modules/bem-components/design/common.blocks/popup/_theme/popup_theme_islands.js */
modules.define('popup', ['objects'], function(provide, objects, Popup) {

provide(Popup.declMod({ modName : 'theme', modVal : 'islands' }, {
    _getDefaultParams : function() {
        return objects.extend(
            this.__base(),
            {
                mainOffset : 5,
                viewportOffset : 10
            });
    }
}));

});

/* end: ../../node_modules/bem-components/design/common.blocks/popup/_theme/popup_theme_islands.js */
/* begin: ../../node_modules/bem-components/common.blocks/popup/_target/popup_target_anchor.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem-dom', 'jquery', 'objects', 'functions__throttle', 'z-index-group'],
    function(provide, bemDom, $, objects, throttle, zIndexGroup, Popup) {

var body = $(bemDom.doc[0].body),
    UPDATE_TARGET_VISIBILITY_THROTTLING_INTERVAL = 100,
    undef;

/**
 * @exports
 * @class popup
 * @bem
 */
provide(Popup.declMod({ modName : 'target', modVal : 'anchor' }, /** @lends popup.prototype */{
    beforeSetMod : {
        'visible' : {
            'true' : function() {
                if(!this._anchor)
                    throw Error('Can\'t show popup without anchor');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                this._destructorClass = bemDom.declBlock('_' + this.__self.getName() + '-destructor');

                this._anchor = null;
                this._anchorParents = null;
                this._destructor = null;
                this._isAnchorVisible = undef;
                this._updateIsAnchorVisible = throttle(
                    this._updateIsAnchorVisible,
                    UPDATE_TARGET_VISIBILITY_THROTTLING_INTERVAL,
                    false,
                    this);
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this._unbindFromDestructor(); // don't destruct anchor as it might be the same anchor for several popups
            }
        },

        'visible' : {
            'true' : function() {
                this._anchorParents = this._anchor.parents();
                this._bindToAnchorParents();

                this.__base.apply(this, arguments);
            },

            '' : function() {
                this.__base.apply(this, arguments);

                this._unbindFromAnchorParents();
                this._anchorParents = null;
                this._isAnchorVisible = undef;
            }
        }
    },

    /**
     * Sets target
     * @param {jQuery|bemDom} anchor DOM elem or anchor bemDom block
     * @returns {popup} this
     */
    setAnchor : function(anchor) {
        this
            ._unbindFromAnchorParents()
            ._unbindFromParentPopup()
            ._unbindFromDestructor();

        this._anchor = anchor.domElem || anchor;

        this._destructor = this._anchor.bem(this._destructorClass);
        this._isAnchorVisible = undef;

        this._bindToDestructor();

        if(this.hasMod('visible')) {
            this._anchorParents = this._anchor.parents();
            this
                ._recaptureZIndex()
                ._bindToAnchorParents()
                ._bindToParentPopup()
                .redraw();
        } else {
            this._anchorParents = null;
            this._zIndexGroupLevel = null;
        }

        return this;
    },

    /**
     * @override
     */
    _calcTargetDimensions : function() {
        var anchor = this._anchor,
            anchorOffset = anchor.offset(),
            bodyOffset = body.css('position') === 'static'?
                { left : 0, top : 0 } :
                body.offset();

        return {
            left : anchorOffset.left - bodyOffset.left,
            top : anchorOffset.top - bodyOffset.top,
            width : anchor.outerWidth(),
            height : anchor.outerHeight()
        };
    },

    /**
     * @override
     */
    _calcDrawingCss : function(drawingParams) {
        typeof this._isAnchorVisible === 'undefined' &&
            (this._isAnchorVisible = this._calcIsAnchorVisible());

        return objects.extend(
            this.__base(drawingParams),
            { display : this._isAnchorVisible? '' : 'none' });
    },

    /**
     * Calculates target visibility state
     * @private
     * @returns {Boolean} Whether state is visible
     */
    _calcIsAnchorVisible : function() {
        var anchor = this._anchor,
            anchorOffset = anchor.offset(),
            anchorLeft = anchorOffset.left,
            anchorTop = anchorOffset.top,
            anchorRight = anchorLeft + anchor.outerWidth(),
            anchorBottom = anchorTop + anchor.outerHeight(),
            direction = this.getMod('direction'),
            vertBorder = this._checkMainDirection(direction, 'top') ||
                    this._checkSecondaryDirection(direction, 'top')?
                anchorTop :
                anchorBottom,
            horizBorder = this._checkMainDirection(direction, 'left') ||
                    this._checkSecondaryDirection(direction, 'left')?
                anchorLeft :
                anchorRight,
            res = true;

        this._anchorParents.each(function() {
            if(this.tagName === 'BODY') return false;

            var parent = $(this),
                overflowY = parent.css('overflow-y'),
                checkOverflowY = overflowY === 'scroll' || overflowY === 'hidden' || overflowY === 'auto',
                overflowX = parent.css('overflow-x'),
                checkOverflowX = overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'auto';

            if(checkOverflowY || checkOverflowX) {
                var parentOffset = parent.offset();

                if(checkOverflowY) {
                    var parentTopOffset = parentOffset.top;
                    if(vertBorder < parentTopOffset || parentTopOffset + parent.outerHeight() < vertBorder) {
                        return res = false;
                    }
                }

                if(checkOverflowX) {
                    var parentLeftOffset = parentOffset.left;
                    return res = !(
                        horizBorder < parentLeftOffset ||
                        parentLeftOffset + parent.outerWidth() < horizBorder);
                }
            }
        });

        return res;
    },

    _calcZIndexGroupLevel : function() {
        var res = this.__base.apply(this, arguments);

        return this._destructor.findParentBlocks(zIndexGroup).reduce(
            function(res, zIndexGroupInstance) {
                return res + Number(zIndexGroupInstance.getMod('level'));
            },
            res);
    },

    _bindToAnchorParents : function() {
        this._domEvents(this._anchorParents).on('scroll', this._onAnchorParentsScroll);
        return this;
    },

    _unbindFromAnchorParents : function() {
        this._anchorParents && this._domEvents(this._anchorParents).un(
            'scroll',
            this._onAnchorParentsScroll);
        return this;
    },

    _onAnchorParentsScroll : function() {
        this
            .redraw()
            ._updateIsAnchorVisible();
    },

    /**
     * @override
     */
    _onWinScrollAndResize : function() {
        this.__base.apply(this, arguments);
        this._updateIsAnchorVisible();
    },

    _updateIsAnchorVisible : function() {
        if(!this.hasMod('js', 'inited') || !this.hasMod('visible'))
            return;

        var isAnchorVisible = this._calcIsAnchorVisible();
        if(isAnchorVisible !== this._isAnchorVisible) {
            this._isAnchorVisible = isAnchorVisible;
            this.redraw();
        }
    },

    _bindToDestructor : function() {
        this._events(this._destructor).on({ modName : 'js', modVal : '' }, this._onPopupAnchorDestruct, this);
        return this;
    },

    _unbindFromDestructor : function() {
        this._destructor &&
            this._events(this._destructor).un({ modName : 'js', modVal : '' }, this._onPopupAnchorDestruct, this);
        return this;
    },

    _onPopupAnchorDestruct : function() {
        bemDom.destruct(this.domElem);
    },

    _getParentPopup : function() {
        if(this._parentPopup) return this._parentPopup;

        var parentPopupDomElem = this._anchor.closest(Popup._buildSelector());

        return this._parentPopup = !!parentPopupDomElem.length && parentPopupDomElem.bem(Popup);
    }
}));

});

/* end: ../../node_modules/bem-components/common.blocks/popup/_target/popup_target_anchor.js */

var BEMHTML;
(function(global) {
function buildBemXjst(libs) {
var exports;
/* BEM-XJST Runtime Start */
var BEMHTML = function(module, exports) {
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.bemhtml = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var inherits = require('inherits');
var Match = require('../bemxjst/match').Match;
var BemxjstEntity = require('../bemxjst/entity').Entity;

/**
 * @class Entity
 * @param {BEMXJST} bemxjst
 * @param {String} block
 * @param {String} elem
 * @param {Array} templates
 */
function Entity(bemxjst) {
  this.bemxjst = bemxjst;

  this.jsClass = null;

  // "Fast modes" about HTML
  this.tag = new Match(this, 'tag');
  this.attrs = new Match(this, 'attrs');
  this.bem = new Match(this, 'bem');
  this.cls = new Match(this, 'cls');

  BemxjstEntity.apply(this, arguments);
}

inherits(Entity, BemxjstEntity);
exports.Entity = Entity;

Entity.prototype.init = function(block, elem) {
  this.block = block;
  this.elem = elem;

  // Class for jsParams
  this.jsClass = this.bemxjst.classBuilder.build(this.block, this.elem);
};

Entity.prototype._keys = {
  tag: 1,
  content: 1,
  attrs: 1,
  mix: 1,
  js: 1,
  mods: 1,
  elemMods: 1,
  cls: 1,
  bem: 1
};

Entity.prototype.defaultBody = function(context) {
  context.mods = this.mods.exec(context);
  if (context.ctx.elem) context.elemMods = this.elemMods.exec(context);

  return this.bemxjst.render(context,
                             this,
                             this.tag.exec(context),
                             this.js.exec(context),
                             this.bem.exec(context),
                             this.cls.exec(context),
                             this.mix.exec(context),
                             this.attrs.exec(context),
                             this.content.exec(context),
                             context.mods,
                             context.elemMods);
};

},{"../bemxjst/entity":5,"../bemxjst/match":8,"inherits":11}],2:[function(require,module,exports){
var inherits = require('inherits');
var utils = require('../bemxjst/utils');
var Entity = require('./entity').Entity;
var BEMXJST = require('../bemxjst');

function BEMHTML(options) {
  BEMXJST.apply(this, arguments);

  this._shortTagCloser = typeof options.xhtml !== 'undefined' &&
                          options.xhtml ? '/>' : '>';

  this._elemJsInstances = options.elemJsInstances;
  this._omitOptionalEndTags = options.omitOptionalEndTags;
  this._singleQuotesForDataAttrs =
    typeof options.singleQuotesForDataAttrs === 'undefined' ?
      false :
      options.singleQuotesForDataAttrs;
  this._unquotedAttrs = typeof options.unquotedAttrs === 'undefined' ?
    false :
    options.unquotedAttrs;
}

inherits(BEMHTML, BEMXJST);
module.exports = BEMHTML;

BEMHTML.prototype.Entity = Entity;

BEMHTML.prototype.runMany = function(arr) {
  var out = '';
  var context = this.context;
  var prevPos = context.position;
  var prevNotNewList = context._notNewList;

  if (prevNotNewList) {
    context._listLength += arr.length - 1;
  } else {
    context.position = 0;
    context._listLength = arr.length;
  }
  context._notNewList = true;

  if (this.canFlush) {
    for (var i = 0; i < arr.length; i++)
      out += context._flush(this._run(arr[i]));
  } else {
    for (var i = 0; i < arr.length; i++)
      out += this._run(arr[i]);
  }

  if (!prevNotNewList)
    context.position = prevPos;

  return out;
};

BEMHTML.prototype.render = function(context, entity, tag, js, bem, cls, mix,
                                           attrs, content, mods, elemMods) {
  if (tag === undefined)
    tag = 'div';
  else if (!tag)
    return (content || content === 0) ? this._run(content) : '';

  var ctx = context.ctx;
  var out = '<' + tag;

  var isBEM = !!(typeof bem !== 'undefined' ?
    bem : entity.block || entity.elem);

  if (!isBEM && !cls)
    return this.renderClose(out, context, tag, attrs, isBEM, ctx, content);

  if (js === true)
    js = {};

  var jsParams;
  if (js) {
    jsParams = {};
    jsParams[entity.jsClass] = js;
  }

  var addJSInitClass = isBEM && jsParams && (
    this._elemJsInstances ?
      entity.block :
      (entity.block && !entity.elem)
  );

  out += ' class=';
  var classValue = '';
  if (isBEM) {
    classValue += entity.jsClass;
    classValue += this.buildModsClasses(entity.block, entity.elem,
                                        entity.elem ? elemMods : mods);

    if (mix) {
      var m = this.renderMix(entity, mix, jsParams, addJSInitClass);
      classValue += m.out;
      jsParams = m.jsParams;
      addJSInitClass = m.addJSInitClass;
    }

    if (cls)
      classValue += ' ' + (typeof cls === 'string' ?
                    utils.attrEscape(cls).trim() : cls);
  } else {
    classValue += typeof cls === 'string' ?
                           utils.attrEscape(cls).trim() : cls;
  }

  if (addJSInitClass)
    classValue += ' i-bem';

  out += this._unquotedAttrs && utils.isUnquotedAttr(classValue) ?
    classValue :
    ('"' + classValue + '"');

  if (isBEM && jsParams)
    out += ' data-bem=\'' + utils.jsAttrEscape(JSON.stringify(jsParams)) + '\'';

  return this.renderClose(out, context, tag, attrs, isBEM, ctx, content);
};

var OPTIONAL_END_TAGS = {
  // https://www.w3.org/TR/html4/index/elements.html
  html: 1, head: 1, body: 1, p: 1, li: 1, dt: 1, dd: 1,
  colgroup: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1, option: 1,

  // html5 https://www.w3.org/TR/html5/syntax.html#optional-tags
  /* dl — Neither tag is omissible */ rb: 1, rt: 1, rtc: 1, rp: 1, optgroup: 1
};

BEMHTML.prototype.renderClose = function(prefix, context, tag, attrs, isBEM,
                                         ctx, content) {
  var out = prefix;

  out += this.renderAttrs(attrs);

  if (utils.isShortTag(tag)) {
    out += this._shortTagCloser;
    if (this.canFlush)
      out = context._flush(out);
  } else {
    out += '>';
    if (this.canFlush)
      out = context._flush(out);

    // TODO(indutny): skip apply next flags
    if (content || content === 0)
      out += this.renderContent(content, isBEM);

    if (!this._omitOptionalEndTags || !OPTIONAL_END_TAGS.hasOwnProperty(tag))
      out += '</' + tag + '>';
  }

  if (this.canFlush)
    out = context._flush(out);
  return out;
};

BEMHTML.prototype.renderAttrs = function(attrs) {
  var out = '';

  // NOTE: maybe we need to make an array for quicker serialization
  if (utils.isObj(attrs)) {

    /* jshint forin : false */
    for (var name in attrs) {
      var attr = attrs[name];
      if (attr === undefined || attr === false || attr === null)
        continue;

      if (attr === true) {
        out += ' ' + name;
      } else {
        var attrVal = utils.isSimple(attr) ? attr : this.run(attr);
        out += ' ' + name + '=';
        out += (this._singleQuotesForDataAttrs && name.indexOf('data-') === 0) ?
          this.getAttrValue(attrVal, utils.jsAttrEscape(attrVal), '\'') :
          this.getAttrValue(attrVal, utils.attrEscape(attrVal), '"');
      }
    }
  }

  return out;
};

BEMHTML.prototype.getAttrValue = function(attrVal, escapedAttrVal, quote) {
  return this._unquotedAttrs && utils.isUnquotedAttr(attrVal) ?
    attrVal :
    (quote + escapedAttrVal + quote);
};

BEMHTML.prototype.renderMix = function(entity, mix, jsParams, addJSInitClass) {
  var visited = {};
  var context = this.context;
  var js = jsParams;
  var addInit = addJSInitClass;

  visited[entity.jsClass] = true;

  // Transform mix to the single-item array if it's not array
  if (!Array.isArray(mix))
    mix = [ mix ];

  var classBuilder = this.classBuilder;

  var out = '';
  for (var i = 0; i < mix.length; i++) {
    var item = mix[i];
    if (!item)
      continue;
    if (typeof item === 'string')
      item = { block: item, elem: undefined };

    var hasItem = false;

    if (item.elem) {
      hasItem = item.elem !== entity.elem && item.elem !== context.elem ||
        item.block && item.block !== entity.block;
    } else if (item.block) {
      hasItem = !(item.block === entity.block && item.mods) ||
        item.mods && entity.elem;
    }

    var block = item.block || item._block || context.block;
    var elem = item.elem || item._elem || context.elem;
    var key = classBuilder.build(block, elem);

    var classElem = item.elem ||
                    item._elem ||
                    (item.block ? undefined : context.elem);
    if (hasItem)
      out += ' ' + classBuilder.build(block, classElem);

    out += this.buildModsClasses(block, classElem,
      (item.elem || !item.block && (item._elem || context.elem)) ?
        item.elemMods : item.mods);

    if (item.js) {
      if (!js)
        js = {};

      js[classBuilder.build(block, item.elem)] =
          item.js === true ? {} : item.js;
      if (!addInit)
        addInit = this._elemJsInstances ?
          (item.elem || block) :
          (block && !item.elem);
    }

    // Process nested mixes from BEMJSON
    if (item.mix) {
      var nested = this.renderMix(entity, item.mix, js, addInit);
      js = utils.extend(js, nested.jsParams);
      addInit = nested.addJSInitClass;
      out += nested.out;
    }

    // Process nested mixes from templates
    if (!hasItem || visited[key])
      continue;

    visited[key] = true;
    var nestedEntity = this.entities[key];
    if (!nestedEntity)
      continue;

    var oldBlock = context.block;
    var oldElem = context.elem;
    var nestedMix = nestedEntity.mix.exec(context);
    context.elem = oldElem;
    context.block = oldBlock;

    if (!nestedMix)
      continue;

    for (var j = 0; j < nestedMix.length; j++) {
      var nestedItem = nestedMix[j];
      if (!nestedItem) continue;

      if (!nestedItem.block &&
          !nestedItem.elem ||
          !visited[classBuilder.build(nestedItem.block, nestedItem.elem)]) {
        if (nestedItem.block) continue;

        nestedItem._block = block;
        nestedItem._elem = elem;
        // make a copy, do not modify original array
        mix = mix.slice(0, i + 1).concat(
          nestedItem,
          mix.slice(i + 1)
        );
      }
    }
  }

  return {
    out: out,
    jsParams: js,
    addJSInitClass: addInit
  };
};

BEMHTML.prototype.buildModsClasses = function(block, elem, mods) {
  if (!mods)
    return '';

  var res = '';

  var modName;

  /*jshint -W089 */
  for (modName in mods) {
    if (!mods.hasOwnProperty(modName) || modName === '')
      continue;

    var modVal = mods[modName];
    if (!modVal && modVal !== 0) continue;
    if (typeof modVal !== 'boolean')
      modVal += '';

    var builder = this.classBuilder;
    res += ' ' + (elem ?
                  builder.buildElemClass(block, elem, modName, modVal) :
                  builder.buildBlockClass(block, modName, modVal));
  }

  return res;
};

},{"../bemxjst":7,"../bemxjst/utils":10,"./entity":1,"inherits":11}],3:[function(require,module,exports){
function ClassBuilder(options) {
  this.elemDelim = options.elem || '__';

  this.modDelim = typeof options.mod === 'string' ?
    {
      name: options.mod || '_',
      val: options.mod || '_'
    } :
    {
      name: options.mod && options.mod.name || '_',
      val: options.mod && options.mod.val || '_'
    };
}

exports.ClassBuilder = ClassBuilder;

ClassBuilder.prototype.build = function(block, elem) {
  if (!elem)
    return block;
  else
    return block + this.elemDelim + elem;
};

ClassBuilder.prototype.buildModPostfix = function(modName, modVal) {
  var res = this.modDelim.name + modName;
  if (modVal !== true) res += this.modDelim.val + modVal;
  return res;
};

ClassBuilder.prototype.buildBlockClass = function(name, modName, modVal) {
  var res = name;
  if (modVal) res += this.buildModPostfix(modName, modVal);
  return res;
};

ClassBuilder.prototype.buildElemClass = function(block, name, modName, modVal) {
  return this.buildBlockClass(block) +
    this.elemDelim +
    name +
    this.buildModPostfix(modName, modVal);
};

ClassBuilder.prototype.split = function(key) {
  return key.split(this.elemDelim, 2);
};

},{}],4:[function(require,module,exports){
var utils = require('./utils');

function Context(bemxjst) {
  this._bemxjst = bemxjst;

  this.ctx = null;
  this.block = '';

  // Save current block until the next BEM entity
  this._currBlock = '';

  this.elem = null;
  this.mods = {};
  this.elemMods = {};

  this.position = 0;
  this._listLength = 0;
  this._notNewList = false;

  this.escapeContent = bemxjst.options.escapeContent !== false;
}
exports.Context = Context;

Context.prototype._flush = null;

Context.prototype.isSimple = utils.isSimple;

Context.prototype.isShortTag = utils.isShortTag;
Context.prototype.extend = utils.extend;
Context.prototype.identify = utils.identify;

Context.prototype.xmlEscape = utils.xmlEscape;
Context.prototype.attrEscape = utils.attrEscape;
Context.prototype.jsAttrEscape = utils.jsAttrEscape;

Context.prototype.onError = function(context, e) {
  console.error('bem-xjst rendering error:', {
    block: context.ctx.block,
    elem: context.ctx.elem,
    mods: context.ctx.mods,
    elemMods: context.ctx.elemMods
  }, e);
};

Context.prototype.isFirst = function() {
  return this.position === 1;
};

Context.prototype.isLast = function() {
  return this.position === this._listLength;
};

Context.prototype.generateId = function() {
  return utils.identify(this.ctx);
};

Context.prototype.reapply = function(ctx) {
  return this._bemxjst.run(ctx);
};

},{"./utils":10}],5:[function(require,module,exports){
var utils = require('./utils');
var Match = require('./match').Match;
var tree = require('./tree');
var Template = tree.Template;
var PropertyMatch = tree.PropertyMatch;
var CompilerOptions = tree.CompilerOptions;

function Entity(bemxjst, block, elem, templates) {
  this.bemxjst = bemxjst;

  this.block = null;
  this.elem = null;

  // Compiler options via `xjstOptions()`
  this.options = {};

  // `true` if entity has just a default renderer for `def()` mode
  this.canFlush = true;

  // "Fast modes"
  this.def = new Match(this);
  this.mix = new Match(this, 'mix');
  this.js = new Match(this, 'js');
  this.mods = new Match(this, 'mods');
  this.elemMods = new Match(this, 'elemMods');
  this.content = new Match(this, 'content');

  // "Slow modes"
  this.rest = {};

  // Initialize
  this.init(block, elem);
  this.initModes(templates);
}
exports.Entity = Entity;

Entity.prototype.init = function(block, elem) {
  this.block = block;
  this.elem = elem;
};

Entity.prototype._keys = {
  content: 1,
  mix: 1,
  js: 1,
  mods: 1,
  elemMods: 1
};

Entity.prototype._initRest = function(key) {
  if (key === 'default') {
    this.rest[key] = this.def;
  } else if (this._keys[key]) {
    this.rest[key] = this[key];
  } else {
    this.rest[key] = this.rest[key] || new Match(this, key);
  }
};

Entity.prototype.initModes = function(templates) {
  /* jshint maxdepth : false */
  for (var i = 0; i < templates.length; i++) {
    var template = templates[i];

    for (var j = template.predicates.length - 1; j >= 0; j--) {
      var pred = template.predicates[j];
      if (!(pred instanceof PropertyMatch))
        continue;

      if (pred.key !== '_mode')
        continue;

      template.predicates.splice(j, 1);
      this._initRest(pred.value);

      // All templates should go there anyway
      this.rest[pred.value].push(template);
      break;
    }

    if (j === -1)
      this.def.push(template);

    // Merge compiler options
    for (var j = template.predicates.length - 1; j >= 0; j--) {
      var pred = template.predicates[j];
      if (!(pred instanceof CompilerOptions))
        continue;

      this.options = utils.extend(this.options, pred.options);
    }
  }
};

Entity.prototype.prepend = function(other) {
  // Prepend to the slow modes, fast modes are in this hashmap too anyway
  var keys = Object.keys(this.rest);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!other.rest[key])
      continue;

    this.rest[key].prepend(other.rest[key]);
  }

  // Add new slow modes
  keys = Object.keys(other.rest);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (this.rest[key])
      continue;

    this._initRest(key);
    this.rest[key].prepend(other.rest[key]);
  }
};

// NOTE: This could be potentially compiled into inlined invokations
Entity.prototype.run = function(context) {
  if (this.def.count !== 0)
    return this.def.exec(context);

  return this.defaultBody(context);
};


function contentMode() {
  return this.ctx.content;
}

Entity.prototype.setDefaults = function() {
  // Default .content() template for applyNext()
  if (this.content.count !== 0)
    this.content.push(new Template([], contentMode));

  // .def() default
  if (this.def.count !== 0) {
    this.canFlush = this.options.flush || false;
    var self = this;
    this.def.push(new Template([], function defaultBodyProxy() {
      return self.defaultBody(this);
    }));
  }
};

},{"./match":8,"./tree":9,"./utils":10}],6:[function(require,module,exports){
function BEMXJSTError(msg, func) {
  this.name = 'BEMXJSTError';
  this.message = msg;

  if (Error.captureStackTrace)
    Error.captureStackTrace(this, func || this.constructor);
  else
    this.stack = (new Error()).stack;
}

BEMXJSTError.prototype = Object.create(Error.prototype);
BEMXJSTError.prototype.constructor = BEMXJSTError;

exports.BEMXJSTError = BEMXJSTError;

},{}],7:[function(require,module,exports){
var inherits = require('inherits');

var Tree = require('./tree').Tree;
var PropertyMatch = require('./tree').PropertyMatch;
var AddMatch = require('./tree').AddMatch;
var Context = require('./context').Context;
var ClassBuilder = require('./class-builder').ClassBuilder;
var utils = require('./utils');

function BEMXJST(options) {
  this.options = options;

  this.entities = null;
  this.defaultEnt = null;

  // Current tree
  this.tree = null;

  // Current match
  this.match = null;

  // Create new Context constructor for overriding prototype
  this.contextConstructor = function ContextChild(bemxjst) {
    Context.call(this, bemxjst);
  };
  inherits(this.contextConstructor, Context);
  this.context = null;

  this.classBuilder = new ClassBuilder(this.options.naming || {});

  // Execution depth, used to invalidate `applyNext` bitfields
  this.depth = 0;

  // Do not call `_flush` on overridden `def()` mode
  this.canFlush = false;

  // oninit templates
  this.oninit = null;

  // Initialize default entity (no block/elem match)
  this.defaultEnt = new this.Entity(this, '', '', []);
  this.defaultElemEnt = new this.Entity(this, '', '', []);
}
module.exports = BEMXJST;

BEMXJST.prototype.locals = Tree.methods
    .concat('local', 'applyCtx', 'applyNext', 'apply');

BEMXJST.prototype.runOninit = function(oninits, ret) {
  var self = ret || this;

  self.BEMContext = this.contextConstructor;
  for (var i = 0; i < oninits.length; i++) {
    // NOTE: oninit has global context instead of BEMXJST
    var oninit = oninits[i];
    oninit(self, { BEMContext: self.BEMContext });
  }
};

BEMXJST.prototype.compile = function(code) {
  var self = this;

  function applyCtx() {
    return self.run(self.context.ctx);
  }

  function _applyCtx() {
    return self._run(self.context.ctx);
  }

  function applyCtxWrap(ctx, changes) {
    // Fast case
    if (!changes)
      return self.local({ ctx: ctx }, applyCtx);

    return self.local(changes, function() {
      return self.local({ ctx: ctx }, _applyCtx);
    });
  }

  function _applyCtxWrap(ctx, changes) {
    // Fast case
    if (!changes)
      return self.local({ ctx: ctx }, _applyCtx);

    return self.local(changes, function() {
      return self.local({ ctx: ctx }, applyCtx);
    });
  }

  function apply(mode, changes) {
    return self.applyMode(mode, changes);
  }

  function localWrap(changes) {
    return function localBody(body) {
      return self.local(changes, body);
    };
  }

  var tree = new Tree({
    refs: {
      applyCtx: applyCtxWrap,
      _applyCtx: _applyCtxWrap,
      apply: apply
    }
  });

  // Yeah, let people pass functions to us!
  var templates = this.recompileInput(code);

  var out = tree.build(templates, [
    localWrap,
    applyCtxWrap,
    function applyNextWrap(changes) {
      if (changes)
        return self.local(changes, applyNextWrap);
      return self.applyNext();
    },
    apply
  ]);

  // Concatenate templates with existing ones
  // TODO(indutny): it should be possible to incrementally add templates
  if (this.tree) {
    this.runOninit(out.oninit);

    out = {
      templates: out.templates.concat(this.tree.templates),
      oninit: this.tree.oninit.concat(out.oninit)
    };
  }
  this.tree = out;

  // Group block+elem entities into a hashmap
  var ent = this.groupEntities(out.templates);

  // Transform entities from arrays to Entity instances
  ent = this.transformEntities(ent);

  this.entities = ent;
  this.oninit = out.oninit;
};

BEMXJST.prototype.getTemplate = function(code, options) {
  this.compile(code, options);

  return this.exportApply();
};

BEMXJST.prototype.recompileInput = function(code) {
  var args = BEMXJST.prototype.locals;
  // Reuse function if it already has right arguments
  if (typeof code === 'function' && code.length === args.length)
    return code;

  return new Function(args.join(', '), utils.fnToString(code));
};

BEMXJST.prototype.groupEntities = function(tree) {
  var res = {};
  for (var i = 0; i < tree.length; i++) {
    // Make sure to change only the copy, the original is cached in `this.tree`
    var template = tree[i].clone();
    var block = null;
    var elem;

    elem = undefined;
    for (var j = 0; j < template.predicates.length; j++) {
      var pred = template.predicates[j];
      if (!(pred instanceof PropertyMatch) &&
        !(pred instanceof AddMatch))
        continue;

      if (pred.key === 'block')
        block = pred.value;
      else if (pred.key === 'elem')
        elem = pred.value;
      else
        continue;

      // Remove predicate, we won't much against it
      template.predicates.splice(j, 1);
      j--;
    }

    if (block === null) {
      var msg = 'block(…) subpredicate is not found.\n' +
      '    See template with subpredicates:\n     * ';

      for (var j = 0; j < template.predicates.length; j++) {
        var pred = template.predicates[j];

        if (j !== 0)
          msg += '\n     * ';

        if (pred.key === '_mode') {
          msg += pred.value + '()';
        } else {
          if (Array.isArray(pred.key)) {
            msg += pred.key[0].replace('mods', 'mod')
              .replace('elemMods', 'elemMod') +
              '(\'' + pred.key[1] + '\', \'' + pred.value + '\')';
          } else {
            msg += 'match(…)';
          }
        }
      }

      msg += '\n    And template body: \n    (' +
        (typeof template.body === 'function' ?
          template.body :
          JSON.stringify(template.body)) + ')';

      if (typeof BEMXJSTError === 'undefined') {
        BEMXJSTError = require('./error').BEMXJSTError;
      }

      throw new BEMXJSTError(msg);
    }

    var key = this.classBuilder.build(block, elem);

    if (!res[key])
      res[key] = [];
    res[key].push(template);
  }
  return res;
};

BEMXJST.prototype.transformEntities = function(entities) {
  var wildcardElems = [];

  var keys = Object.keys(entities);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];

    // TODO(indutny): pass this values over
    var parts = this.classBuilder.split(key);
    var block = parts[0];
    var elem = parts[1];

    if (elem === '*')
      wildcardElems.push(block);

    entities[key] = new this.Entity(
      this, block, elem, entities[key]);
  }

  // Merge wildcard block templates
  if (entities.hasOwnProperty('*')) {
    var wildcard = entities['*'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === '*')
        continue;

      entities[key].prepend(wildcard);
    }
    this.defaultEnt.prepend(wildcard);
    this.defaultElemEnt.prepend(wildcard);
  }

  // Merge wildcard elem templates
  for (var i = 0; i < wildcardElems.length; i++) {
    var block = wildcardElems[i];
    var wildcardKey = this.classBuilder.build(block, '*');
    var wildcard = entities[wildcardKey];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === wildcardKey)
        continue;

      var entity = entities[key];
      if (entity.block !== block || entity.elem === undefined)
        continue;

      entities[key].prepend(wildcard);
    }
    this.defaultElemEnt.prepend(wildcard);
  }

  // Set default templates after merging with wildcard
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    entities[key].setDefaults();
    this.defaultEnt.setDefaults();
    this.defaultElemEnt.setDefaults();
  }

  return entities;
};

BEMXJST.prototype._run = function(context) {
  if (context === undefined || context === '' || context === null)
    return this.runEmpty();
  else if (Array.isArray(context))
    return this.runMany(context);
  else if (
    typeof context.html === 'string' &&
    !context.tag &&
    typeof context.block === 'undefined' &&
    typeof context.elem === 'undefined' &&
    typeof context.cls === 'undefined' &&
    typeof context.attrs === 'undefined'
  )
    return this.runUnescaped(context);
  else if (utils.isSimple(context))
    return this.runSimple(context);

  return this.runOne(context);
};

BEMXJST.prototype.run = function(json) {
  var match = this.match;
  var context = this.context;
  var depth = this.depth;

  this.match = null;
  this.context = new this.contextConstructor(this);
  this.canFlush = this.context._flush !== null;
  this.depth = 0;
  var res = this._run(json);

  if (this.canFlush)
    res = this.context._flush(res);

  this.match = match;
  this.context = context;
  this.depth = depth;

  return res;
};

BEMXJST.prototype.runEmpty = function() {
  this.context._listLength--;
  return '';
};

BEMXJST.prototype.runUnescaped = function(context) {
  this.context._listLength--;
  return '' + context.html;
};

BEMXJST.prototype.runSimple = function(simple) {
  this.context._listLength--;
  if (!simple && simple !== 0 || simple === true)
    return '';

  return typeof simple === 'string' && this.context.escapeContent ?
      utils.xmlEscape(simple) :
      simple;
};

BEMXJST.prototype.runOne = function(json) {
  var context = this.context;

  var oldCtx = context.ctx;
  var oldBlock = context.block;
  var oldCurrBlock = context._currBlock;
  var oldElem = context.elem;
  var oldMods = context.mods;
  var oldElemMods = context.elemMods;

  if (json.block || json.elem)
    context._currBlock = '';
  else
    context._currBlock = context.block;

  context.ctx = json;
  if (json.block) {
    context.block = json.block;

    if (json.mods)
      context.mods = json.mods;
    else if (json.block !== oldBlock || !json.elem)
      context.mods = {};
  } else {
    if (!json.elem)
      context.block = '';
    else if (oldCurrBlock)
      context.block = oldCurrBlock;
  }

  context.elem = json.elem;
  context.elemMods = json.elemMods || {};

  var block = context.block || '';
  var elem = context.elem;

  // Control list position
  if (block || elem)
    context.position++;
  else
    context._listLength--;

  // To invalidate `applyNext` flags
  this.depth++;

  var restoreFlush = false;
  var ent = this.entities[this.classBuilder.build(block, elem)];
  if (ent) {
    if (this.canFlush && !ent.canFlush) {
      // Entity does not support flushing, do not flush anything nested
      restoreFlush = true;
      this.canFlush = false;
    }
  } else {
    // No entity - use default one
    ent = this.defaultEnt;
    if (elem !== undefined)
      ent = this.defaultElemEnt;
    ent.init(block, elem);
  }

  var res = this.options.production === true ?
    this.tryRun(context, ent) :
    ent.run(context);

  context.ctx = oldCtx;
  context.block = oldBlock;
  context.elem = oldElem;
  context.mods = oldMods;
  context.elemMods = oldElemMods;
  context._currBlock = oldCurrBlock;
  this.depth--;
  if (restoreFlush)
    this.canFlush = true;

  return res;
};

BEMXJST.prototype.tryRun = function(context, ent) {
  try {
    return ent.run(context);
  } catch (e) {
    return context.onError(context, e) || '';
  }
};

BEMXJST.prototype.renderContent = function(content, isBEM) {
  var context = this.context;
  var oldPos = context.position;
  var oldListLength = context._listLength;
  var oldNotNewList = context._notNewList;

  context._notNewList = false;
  if (isBEM) {
    context.position = 0;
    context._listLength = 1;
  }

  var res = this._run(content);

  context.position = oldPos;
  context._listLength = oldListLength;
  context._notNewList = oldNotNewList;

  return res;
};

BEMXJST.prototype.local = function(changes, body) {
  var keys = Object.keys(changes);
  var restore = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var parts = key.split('.');

    var value = this.context;
    for (var j = 0; j < parts.length - 1; j++)
      value = value[parts[j]];

    restore.push({
      parts: parts,
      value: value[parts[j]]
    });
    value[parts[j]] = changes[key];
  }

  var res = body.call(this.context);

  for (var i = 0; i < restore.length; i++) {
    var parts = restore[i].parts;
    var value = this.context;
    for (var j = 0; j < parts.length - 1; j++)
      value = value[parts[j]];

    value[parts[j]] = restore[i].value;
  }

  return res;
};

BEMXJST.prototype.applyNext = function() {
  return this.match.exec(this.context);
};

BEMXJST.prototype.applyMode = function(mode, changes) {
  var match = this.match;

  if (!match) {
    var key = this.classBuilder.build(this.context.block, this.context.elem);
    match = this.entities[key].rest[mode];
  } else {
    match = match.entity.rest[mode];
  }

  if (!match) {
    if (mode === 'mods')
      return this.context.mods;

    if (mode === 'elemMods')
      return this.context.elemMods;

    return this.context.ctx[mode];
  }

  if (!changes)
    return match.exec(this.context);

  var self = this;

  // Allocate function this way, to prevent allocation at the top of the
  // `applyMode`
  var localBody = function() {
    return match.exec(self.context);
  };
  return this.local(changes, localBody);
};

BEMXJST.prototype.exportApply = function(exports) {
  var self = this;
  var ret = exports || {};

  ret.apply = function(context) {
    return self.run(context);
  };

  // Add templates at run time
  ret.compile = function(templates) {
    self.compile(templates);
    return ret;
  };

  this.runOninit(self.oninit, ret);

  return ret;
};

},{"./class-builder":3,"./context":4,"./error":6,"./tree":9,"./utils":10,"inherits":11}],8:[function(require,module,exports){
var tree = require('./tree');
var PropertyMatch = tree.PropertyMatch;
var AddMatch = tree.AddMatch;
var WrapMatch = tree.WrapMatch;
var ExtendMatch = tree.ExtendMatch;
var CustomMatch = tree.CustomMatch;

function MatchNested(template, pred) {
  this.template = template;
  this.keys = pred.key;
  this.value = pred.value;
}

MatchNested.prototype.exec = function(context) {
  var val = context;
  var keys = this.keys;

  for (var i = 0; i < keys.length - 1; i++) {
    val = val[keys[i]];
    if (!val)
      return false;
  }

  val = val[keys[i]];

  if (this.value === true)
    return val !== undefined && val !== '' && val !== false && val !== null;

  return String(val) === this.value;
};

function MatchCustom(template, pred) {
  this.template = template;
  this.body = pred.body;
}

MatchCustom.prototype.exec = function(context) {
  return this.body.call(context, context, context.ctx);
};

function MatchWrap(template) {
  this.template = template;
  this.wrap = null;
}

MatchWrap.prototype.exec = function(context) {
  var res = this.wrap !== context.ctx;
  this.wrap = context.ctx;
  return res;
};

function MatchExtend(template) {
  this.template = template;
  this.wrap = null;
}

MatchExtend.prototype.exec = function(context) {
  var res = this.ext !== context.ctx;
  this.ext = context.ctx;
  return res;
};

function AddWrap(template, pred) {
  this.template = template;
  this.key = pred.key;
  this.value = pred.value;
}

AddWrap.prototype.exec = function(context) {
  return context[this.key] === this.value;
};

function MatchTemplate(mode, template) {
  this.mode = mode;
  this.predicates = new Array(template.predicates.length);
  this.body = template.body;

  var postpone = [];

  for (var i = 0, j = 0; i < this.predicates.length; i++, j++) {
    var pred = template.predicates[i];
    if (pred instanceof PropertyMatch) {
      this.predicates[j] = new MatchNested(this, pred);
    } else if (pred instanceof ExtendMatch) {
      j--;
      postpone.push(new MatchExtend(this));
    } else if (pred instanceof AddMatch) {
      this.predicates[j] = new AddWrap(this, pred);
    } else if (pred instanceof CustomMatch) {
      this.predicates[j] = new MatchCustom(this, pred);

      // Push MatchWrap later, they should not be executed first.
      // Otherwise they will set flag too early, and body might not be executed
    } else if (pred instanceof WrapMatch) {
      j--;
      postpone.push(new MatchWrap(this));
    } else {
      // Skip
      j--;
    }
  }

  // Insert late predicates
  for (var i = 0; i < postpone.length; i++, j++)
    this.predicates[j] = postpone[i];

  if (this.predicates.length !== j)
    this.predicates.length = j;
}
exports.MatchTemplate = MatchTemplate;

function Match(entity, modeName) {
  this.entity = entity;
  this.modeName = modeName;
  this.bemxjst = this.entity.bemxjst;
  this.templates = [];

  // applyNext mask
  this.mask = [ 0 ];

  // We are going to create copies of mask for nested `applyNext()`
  this.maskSize = 0;
  this.maskOffset = 0;

  this.count = 0;
  this.depth = -1;

  this.thrownError = null;
}
exports.Match = Match;

Match.prototype.prepend = function(other) {
  this.templates = other.templates.concat(this.templates);
  this.count += other.count;

  while (Math.ceil(this.count / 31) > this.mask.length)
    this.mask.push(0);

  this.maskSize = this.mask.length;
};

Match.prototype.push = function(template) {
  this.templates.push(new MatchTemplate(this, template));
  this.count++;

  if (Math.ceil(this.count / 31) > this.mask.length)
    this.mask.push(0);

  this.maskSize = this.mask.length;
};

Match.prototype.tryCatch = function(fn, ctx) {
  try {
    return fn.call(ctx, ctx, ctx.ctx);
  } catch (e) {
    this.thrownError = e;
    if (this.modeName) {
      this.thrownError.ctx = ctx;
      this.thrownError.name = 'BEMXJST ERROR';
      var classBuilder = this.entity.bemxjst.classBuilder;

      var cause = e.stack.split('\n')[1];
      this.thrownError.message = 'Template error in mode ' +
            this.modeName + ' in block ' +
            classBuilder.build(ctx.ctx.block, ctx.ctx.elem) +
            '\n    ' + e.message + '\n';
      this.thrownError.stack = this.thrownError.name + ': ' +
            this.thrownError.message + ' ' + cause + '\n' + e.stack;
    }
  }
};

Match.prototype.exec = function(context) {
  var save = this.checkDepth();

  var template;
  var bitIndex = this.maskOffset;
  var mask = this.mask[bitIndex];
  var bit = 1;
  for (var i = 0; i < this.count; i++) {
    if ((mask & bit) === 0) {
      template = this.templates[i];
      for (var j = 0; j < template.predicates.length; j++) {
        var pred = template.predicates[j];

        /* jshint maxdepth : false */
        if (!pred.exec(context))
          break;
      }

      // All predicates matched!
      if (j === template.predicates.length)
        break;
    }

    if (bit === 0x40000000) {
      bitIndex++;
      mask = this.mask[bitIndex];
      bit = 1;
    } else {
      bit <<= 1;
    }
  }

  if (i === this.count) {
    this.restoreDepth(save);

    if (this.modeName === 'mods')
      return context.mods;

    if (this.modeName === 'elemMods')
      return context.elemMods;

    return context.ctx[this.modeName];
  }

  var oldMask = mask;
  var oldMatch = this.bemxjst.match;
  this.mask[bitIndex] |= bit;
  this.bemxjst.match = this;

  this.thrownError = null;

  var out;
  if (typeof template.body === 'function')
    out = this.tryCatch(template.body, context);
  else
    out = template.body;

  this.mask[bitIndex] = oldMask;
  this.bemxjst.match = oldMatch;
  this.restoreDepth(save);

  var e = this.thrownError;
  if (e !== null) {
    this.thrownError = null;
    throw e;
  }

  return out;
};

Match.prototype.checkDepth = function() {
  if (this.depth === -1) {
    this.depth = this.bemxjst.depth;
    return -1;
  }

  if (this.bemxjst.depth === this.depth)
    return this.depth;

  var depth = this.depth;
  this.depth = this.bemxjst.depth;

  this.maskOffset += this.maskSize;

  while (this.mask.length < this.maskOffset + this.maskSize)
    this.mask.push(0);

  return depth;
};

Match.prototype.restoreDepth = function(depth) {
  if (depth !== -1 && depth !== this.depth)
    this.maskOffset -= this.maskSize;
  this.depth = depth;
};

},{"./tree":9}],9:[function(require,module,exports){
var inherits = require('inherits');
var utils = require('./utils');

function Template(predicates, body) {
  this.predicates = predicates;

  this.body = body;
}
exports.Template = Template;

Template.prototype.wrap = function() {
  var body = this.body;
  for (var i = 0; i < this.predicates.length; i++) {
    var pred = this.predicates[i];
    body = pred.wrapBody(body);
  }
  this.body = body;
};

Template.prototype.clone = function() {
  return new Template(this.predicates.slice(), this.body);
};

function MatchBase() {
}
exports.MatchBase = MatchBase;

MatchBase.prototype.wrapBody = function(body) {
  return body;
};

function Item(tree, children) {
  this.conditions = [];
  this.children = [];

  for (var i = children.length - 1; i >= 0; i--) {
    var arg = children[i];
    if (arg instanceof MatchBase)
      this.conditions.push(arg);
    else if (arg === tree.boundBody)
      this.children[i] = tree.queue.pop();
    else
      this.children[i] = arg;
  }
}

function WrapMatch(refs) {
  MatchBase.call(this);

  this.refs = refs;
}
inherits(WrapMatch, MatchBase);
exports.WrapMatch = WrapMatch;

WrapMatch.prototype.wrapBody = function(body) {
  var _applyCtx = this.refs._applyCtx;

  if (typeof body !== 'function') {
    return function() {
      return _applyCtx(body);
    };
  }

  return function() {
    return _applyCtx(body.call(this, this, this.ctx));
  };
};

function ReplaceMatch(refs) {
  MatchBase.call(this);

  this.refs = refs;
}
inherits(ReplaceMatch, MatchBase);
exports.ReplaceMatch = ReplaceMatch;

ReplaceMatch.prototype.wrapBody = function(body) {
  var applyCtx = this.refs.applyCtx;

  if (typeof body !== 'function') {
    return function() {
      return applyCtx(body, { position: this.position - 1 });
    };
  }

  return function() {
    return applyCtx(body.call(this, this, this.ctx),
                    { position: this.position - 1 });
  };
};

function ExtendMatch(refs) {
  MatchBase.call(this);

  this.refs = refs;
}
inherits(ExtendMatch, MatchBase);
exports.ExtendMatch = ExtendMatch;

ExtendMatch.prototype.wrapBody = function(body) {
  var refs = this.refs;
  var applyCtx = refs.applyCtx;

  if (typeof body !== 'function') {
    return function() {
      var changes = {};

      var keys = Object.keys(body);
      for (var i = 0; i < keys.length; i++)
        changes[keys[i]] = body[keys[i]];

      return applyCtx(this.ctx, changes);
    };
  }

  return function() {
    var changes = {};

    var obj = body.call(this, this, this.ctx);
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++)
      changes[keys[i]] = obj[keys[i]];

    return applyCtx(this.ctx, changes);
  };
};

function AddMatch(mode, refs) {
  MatchBase.call(this);

  this.mode = mode;
  this.refs = refs;
}
inherits(AddMatch, MatchBase);
exports.AddMatch = AddMatch;

AddMatch.prototype.wrapBody = function(body) {
  return this[this.mode + 'WrapBody'](body);
};

AddMatch.prototype.appendContentWrapBody = function(body) {
  var apply = this.refs.apply;

  if (typeof body !== 'function') {
    return function() {
      return [ apply('content') , body ];
    };
  }

  return function() {
    return [ apply('content'), body.call(this, this, this.ctx) ];
  };
};

AddMatch.prototype.prependContentWrapBody = function(body) {
  var apply = this.refs.apply;

  if (typeof body !== 'function') {
    return function() {
      return [ body, apply('content') ];
    };
  }

  return function() {
    return [ body.call(this, this, this.ctx), apply('content') ];
  };
};

AddMatch.prototype.mixWrapBody = function(body) {
  var apply = this.refs.apply;

  if (typeof body !== 'function') {
    return function() {
      var ret = apply('mix');
      /* istanbul ignore else */
      if (!Array.isArray(ret)) ret = [ ret ];
      return ret.concat(body);
    };
  }

  return function() {
    var ret = apply('mix');
    if (!Array.isArray(ret)) ret = [ ret ];
    return ret.concat(body.call(this, this, this.ctx));
  };
};

[ 'attrs', 'js', 'mods', 'elemMods' ].forEach(function(method) {
  AddMatch.prototype[ method + 'WrapBody'] = function(body) {
    var apply = this.refs.apply;

    return typeof body !== 'function' ?
      function() {
        return (this[method] = utils.extend(apply(method) || {}, body));
      } :
      function() {
        return (this[method] = utils.extend(apply(method) || {},
                               body.call(this, this, this.ctx)));
      };
  };
});

function CompilerOptions(options) {
  MatchBase.call(this);
  this.options = options;
}
inherits(CompilerOptions, MatchBase);
exports.CompilerOptions = CompilerOptions;

function PropertyMatch(key, value) {
  MatchBase.call(this);

  this.key = key;
  this.value = value;
}
inherits(PropertyMatch, MatchBase);
exports.PropertyMatch = PropertyMatch;

function CustomMatch(body) {
  MatchBase.call(this);

  this.body = body;
}
inherits(CustomMatch, MatchBase);
exports.CustomMatch = CustomMatch;

function Tree(options) {
  this.options = options;
  this.refs = this.options.refs;

  this.boundBody = this.body.bind(this);

  var methods = this.methods('body');
  for (var i = 0; i < methods.length; i++) {
    var method = methods[i];
    // NOTE: method.name is empty because of .bind()
    this.boundBody[Tree.methods[i]] = method;
  }

  this.queue = [];
  this.templates = [];
  this.initializers = [];
}
exports.Tree = Tree;

Tree.methods = [
  // Subpredicates:
  'match', 'block', 'elem', 'mod', 'elemMod',
  // Runtime related:
  'oninit', 'xjstOptions',
  // Output generators:
  'wrap', 'replace', 'extend', 'mode', 'def',
  'content', 'appendContent', 'prependContent',
  'attrs', 'addAttrs', 'js', 'addJs', 'mix', 'addMix',
  'mods', 'addMods', 'addElemMods', 'elemMods',
  'tag', 'cls', 'bem'
];

Tree.prototype.build = function(templates, apply) {
  var methods = this.methods('global').concat(apply);
  methods[0] = this.match.bind(this);

  templates.apply({}, methods);

  return {
    templates: this.templates.slice().reverse(),
    oninit: this.initializers
  };
};

function methodFactory(self, kind, name) {
  var method = self[name];
  var boundBody = self.boundBody;

  if (kind !== 'body') {
    if (name === 'replace' || name === 'extend' || name === 'wrap') {
      return function() {
        return method.apply(self, arguments);
      };
    }

    return function() {
      method.apply(self, arguments);
      return boundBody;
    };
  }

  return function() {
    var res = method.apply(self, arguments);

    // Insert body into last item
    var child = self.queue.pop();
    var last = self.queue[self.queue.length - 1];
    last.conditions = last.conditions.concat(child.conditions);
    last.children = last.children.concat(child.children);

    if (name === 'replace' || name === 'extend' || name === 'wrap')
      return res;
    return boundBody;
  };
}

Tree.prototype.methods = function(kind) {
  var out = new Array(Tree.methods.length);

  for (var i = 0; i < out.length; i++) {
    var name = Tree.methods[i];
    out[i] = methodFactory(this, kind, name);
  }

  return out;
};

// Called after all matches
Tree.prototype.flush = function(conditions, item) {
  var subcond = item.conditions ?
    conditions.concat(item.conditions) :
    item.conditions;

  for (var i = 0; i < item.children.length; i++) {
    var arg = item.children[i];

    // Go deeper
    if (arg instanceof Item) {
      this.flush(subcond, item.children[i]);

    // Body
    } else {
      if (this.isShortcutAllowed(arg, conditions)) {
        var keys = Object.keys(arg);
        for (var n = 0; n < keys.length; n++)
          this.addTemplate(
            conditions.concat(this.createMatch(keys[n])),
            arg[keys[n]]
          );
      } else {
        this.addTemplate(conditions, arg);
      }
    }
  }
};

Tree.prototype.createMatch = function(modeName) {
  switch (modeName) {
    case 'addAttrs':
      return [
        new PropertyMatch('_mode', 'attrs'),
        new AddMatch('attrs', this.refs)
      ];
    case 'addJs':
      return [
        new PropertyMatch('_mode', 'js'),
        new AddMatch('js', this.refs)
      ];
    case 'addMix':
      return [
        new PropertyMatch('_mode', 'mix'),
        new AddMatch('mix', this.refs)
      ];
    case 'addMods':
      return [
        new PropertyMatch('_mode', 'mods'),
        new AddMatch('mods', this.refs)
      ];
    case 'addElemMods':
      return [
        new PropertyMatch('_mode', 'elemMods'),
        new AddMatch('elemMods', this.refs)
      ];
    case 'appendContent':
    case 'prependContent':
      return [
        new PropertyMatch('_mode', 'content'),
        new AddMatch(modeName, this.refs)
      ];

    case 'wrap':
      return new WrapMatch(this.refs);

    case 'replace':
      return new ReplaceMatch(this.refs);

    case 'extend':
      return new ExtendMatch(this.refs);

    case 'def':
      return new PropertyMatch('_mode', 'default');

    default:
      return new PropertyMatch('_mode', modeName);
  }
};

Tree.prototype.addTemplate = function(conditions, arg) {
  var template = new Template(conditions, arg);
  template.wrap();
  this.templates.push(template);
};

Tree.prototype.body = function() {
  var children = new Array(arguments.length);
  for (var i = 0; i < arguments.length; i++)
    children[i] = arguments[i];

  var child = new Item(this, children);
  this.queue[this.queue.length - 1].children.push(child);

  if (this.queue.length === 1)
    this.flush([], this.queue.shift());

  return this.boundBody;
};

Tree.modsCheck = { mods: 1, elemMods: 1 };

Tree.checkConditions = function(conditions) {
  for (var i = 0; i < conditions.length; i++) {
    var condition = conditions[i];
    if (condition.key === 'block' ||
      condition.key === 'elem' ||
      (Array.isArray(condition.key) && Tree.modsCheck[condition.key[0]]) ||
      condition instanceof CustomMatch) continue;
    return false;
  }

  return true;
};

Tree.prototype.isShortcutAllowed = function(arg, conditions) {
  return typeof arg === 'object' &&
    arg !== null &&
    !Array.isArray(arg) &&
    Tree.checkConditions(conditions);
};

Tree.prototype.match = function() {
  var children = new Array(arguments.length);

  if (!arguments.length)
    throw new Error('.match() must have argument');

  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i];
    if (typeof arg === 'function')
      arg = new CustomMatch(arg);

    if (!(arg instanceof MatchBase))
      throw new Error('Wrong .match() argument');

    children[i] = arg;
  }

  this.queue.push(new Item(this, children));

  return this.boundBody;
};

Tree.prototype.applyMode = function(args, mode) {
  if (args.length) {
    throw new Error('Predicate should not have arguments but ' +
      JSON.stringify(args) + ' passed');
  }

  return this.mode(mode);
};

Tree.prototype.xjstOptions = function(options) {
  this.queue.push(new Item(this, [
    new CompilerOptions(options)
  ]));
  return this.boundBody;
};

[ 'mode', 'elem', 'block' ].forEach(function(method) {
  Tree.prototype[method] = function(name) {
    return this.match(new PropertyMatch(
      method === 'mode' ? '_mode' : method, name));
  };
});

[ 'mod', 'elemMod' ].forEach(function(method) {
  Tree.prototype[method] = function(name, value) {
    return this.match(new PropertyMatch([ method + 's', name ],
                                  value === undefined ? true : String(value)));
  };
});

Tree.prototype.def = function() {
  return this.applyMode(arguments, 'default');
};

[
  'content', 'mix', 'bem', 'js', 'cls', 'attrs', 'tag', 'elemMods', 'mods'
].forEach(function(method) {
  Tree.prototype[method] = function() {
    return this.applyMode(arguments, method);
  };
});

[ 'appendContent', 'prependContent' ].forEach(function(method) {
  Tree.prototype[method] = function() {
    return this.content.apply(this, arguments)
      .match(new AddMatch(method, this.refs));
  };
});

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}

[ 'mods', 'elemMods', 'attrs', 'js', 'mix' ].forEach(function(method) {
  Tree.prototype['add' + capitalize(method)] = function() {
    return this[method].apply(this, arguments)
      .match(new AddMatch(method, this.refs));
  };
});

Tree.prototype.wrap = function() {
  return this.def.apply(this, arguments).match(new WrapMatch(this.refs));
};

Tree.prototype.replace = function() {
  return this.def.apply(this, arguments).match(new ReplaceMatch(this.refs));
};

Tree.prototype.extend = function() {
  return this.def.apply(this, arguments).match(new ExtendMatch(this.refs));
};

Tree.prototype.oninit = function(fn) {
  this.initializers.push(fn);
};

},{"./utils":10,"inherits":11}],10:[function(require,module,exports){
var amp = '&amp;';
var lt = '&lt;';
var gt = '&gt;';
var quot = '&quot;';
var singleQuot = '&#39;';

var matchXmlRegExp = /[&<>]/;

function isEmpty(string) {
  return typeof string === 'undefined' ||
     string === null ||
     (typeof string === 'number' && isNaN(string));
}

exports.xmlEscape = function(string) {
  if (isEmpty(string))
    return '';

  var str = '' + string;
  var match = matchXmlRegExp.exec(str);

  if (!match)
    return str;

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 38: // &
        escape = amp;
        break;
      case 60: // <
        escape = lt;
        break;
      case 62: // >
        escape = gt;
        break;
      default:
        continue;
    }

    if (lastIndex !== index)
      html += str.substring(lastIndex, index);

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ?
    html + str.substring(lastIndex, index) :
    html;
};

var matchAttrRegExp = /["&<>]/;

exports.attrEscape = function(string) {
  if (isEmpty(string))
    return '';

  var str = '' + string;
  var match = matchAttrRegExp.exec(str);

  if (!match)
    return str;

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = quot;
        break;
      case 38: // &
        escape = amp;
        break;
      case 60: // <
        escape = lt;
        break;
      case 62: // >
        escape = gt;
        break;
      default:
        continue;
    }

    if (lastIndex !== index)
      html += str.substring(lastIndex, index);

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ?
    html + str.substring(lastIndex, index) :
    html;
};

var matchJsAttrRegExp = /['&]/;

exports.jsAttrEscape = function(string) {
  if (isEmpty(string))
    return '';

  var str = '' + string;
  var match = matchJsAttrRegExp.exec(str);

  if (!match)
    return str;

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 38: // &
        escape = amp;
        break;
      case 39: // '
        escape = singleQuot;
        break;
      default:
        continue;
    }

    if (lastIndex !== index)
      html += str.substring(lastIndex, index);

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ?
    html + str.substring(lastIndex, index) :
    html;
};

exports.extend = function(o1, o2) {
  if (!o1 || !o2)
    return o1 || o2;

  var res = {};
  var n;

  for (n in o1)
    /* istanbul ignore else */
    if (o1.hasOwnProperty(n))
      res[n] = o1[n];
  for (n in o2)
    /* istanbul ignore else */
    if (o2.hasOwnProperty(n))
      res[n] = o2[n];
  return res;
};

var SHORT_TAGS = { // hash for quick check if tag short
  area: 1, base: 1, br: 1, col: 1, command: 1, embed: 1, hr: 1, img: 1,
  input: 1, keygen: 1, link: 1, meta: 1, param: 1, source: 1, wbr: 1
};

exports.isShortTag = function(t) {
  return SHORT_TAGS.hasOwnProperty(t);
};

exports.isSimple = function isSimple(obj) {
  if (!obj ||
      obj === true ||
      typeof obj === 'string' ||
      typeof obj === 'number')
    return true;

  if (!obj.block &&
      !obj.elem &&
      !obj.tag &&
      !obj.cls &&
      !obj.attrs &&
      obj.hasOwnProperty('html') &&
      isSimple(obj.html))
    return true;

  return false;
};

exports.isObj = function(val) {
  return val && typeof val === 'object' && !Array.isArray(val) &&
    val !== null;
};

var uniqCount = 0;
var uniqId = +new Date();
var uniqExpando = '__' + uniqId;
var uniqPrefix = 'uniq' + uniqId;

function getUniq() {
  return uniqPrefix + (++uniqCount);
}
exports.getUniq = getUniq;

exports.identify = function(obj, onlyGet) {
  if (!obj)
    return getUniq();
  if (onlyGet || obj[uniqExpando])
    return obj[uniqExpando];

  var u = getUniq();
  obj[uniqExpando] = u;
  return u;
};

exports.fnToString = function(code) {
  // It is fine to compile without templates at first
  if (!code)
    return '';

  if (typeof code === 'function') {
    // Examples for regular function
    //   function () { … }
    //   function name() { … }
    //   function (a, b) { … }
    //   function name(a, b) { … }
    //
    // Examples for arrow function
    //   () => { … }
    //   (a, b) => { … }
    //   _ => { … }

    code = code.toString();
    code = code.replace(
      code.indexOf('function') === 0 ?
      /^function\s*[^{]+{|}$/g :
      /^(_|\(\w|[^=>]+\))\s=>\s{|}$/g,
    '');
  }

  return code;
};

/**
 * regexp for check may attribute be unquoted
 *
 * https://www.w3.org/TR/html4/intro/sgmltut.html#h-3.2.2
 * https://www.w3.org/TR/html5/syntax.html#attributes
 */
var UNQUOTED_ATTR_REGEXP = /^[:\w.-]+$/;

exports.isUnquotedAttr = function(str) {
  return str && UNQUOTED_ATTR_REGEXP.exec(str);
};

},{}],11:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}]},{},[2])(2)
});;
return module.exports || exports.BEMHTML;
}({}, {});
var api = new BEMHTML({"elemJsInstances":true,"exportName":"BEMHTML","to":"E:\\bem\\travel"});
api.compile(function(match, block, elem, mod, elemMod, oninit, xjstOptions, wrap, replace, extend, mode, def, content, appendContent, prependContent, attrs, addAttrs, js, addJs, mix, addMix, mods, addMods, addElemMods, elemMods, tag, cls, bem, local, applyCtx, applyNext, apply) {
/* BEM-XJST User code here: */
/* begin: E:\bem\travel\node_modules\bem-core\common.blocks\ua\ua.bemhtml.js */
block('ua')(
    tag()('script'),
    bem()(false),
    content()([
        '(function(e,c){',
            'e[c]=e[c].replace(/(ua_js_)no/g,"$1yes");',
        '})(document.documentElement,"className");'
    ])
);

/* end: E:\bem\travel\node_modules\bem-core\common.blocks\ua\ua.bemhtml.js */
/* begin: E:\bem\travel\desktop.blocks\calendar\calendar.bemhtml.js */
block('calendar')(
    js()(function() {
        var prevJs = applyNext(),
            js = { val: this.ctx.val };

        return prevJs ? this.extend(prevJs, js) : js;
    })
);
/* end: E:\bem\travel\desktop.blocks\calendar\calendar.bemhtml.js */
;
;oninit(function(exports, context) {
var BEMContext = exports.BEMContext || context.BEMContext;
BEMContext.prototype.require = function(lib) {
return this._libs[lib];
};
});
;});
exports = api.exportApply(exports);
if (libs) exports.BEMContext.prototype._libs = libs;
return exports;
};

var glob = this.window || this.global || this;
var exp = typeof exports !== "undefined" ? exports : global;
if (typeof modules === "object") {



modules.define("BEMHTML",[],function(provide) { var engine = buildBemXjst({});provide(engine);});
} else {
var _libs = {};


if (Object.keys(_libs).length) {
BEMHTML = buildBemXjst(_libs);
exp["BEMHTML"] = BEMHTML;
exp["BEMHTML"].libs = _libs;
} else {
BEMHTML= buildBemXjst(glob);
exp["BEMHTML"] = BEMHTML;exp["BEMHTML"].libs = glob;
}
}
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
