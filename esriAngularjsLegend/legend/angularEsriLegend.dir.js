/*
    layers:                         determines what layers are visible and/or collapsed
                                    {
                                        "layer1": {
                                            subLayerIds: [0, 2],        //list of sublayers to act on
                                            show: true,                 //determines if the sublayers are visible or hidden
                                            collapsed:true              //sets the layer collapsed if true else it's expanded.
                                        }
                                        "*": {
                                            show:true;     //this tell the legend what to do with the remaining layers not specified, in this case show them
                                        }
                                    }
*/

String.prototype.format = function () {
    var args = arguments;
    return this.replace(/\{(\d+)\}/g, function (m, n) { return args[n]; });
};

dojo.require("dojo/Deferred");
angular.module('angularEsriLegend', [])
.directive('esriLegendDir', ['$timeout', function ($timeout) {
    function ensureDefault(options, prop, value1, value2) {
        if (!options.hasOwnProperty(prop)) {
            if (value1 != null) {
                options[prop] = value1;
            }
            else {
                options[prop] = value2;
            }
        }
    };

    return {
        restrict: 'A',
        scope: {
            map: "=",
            options: '='
        },
        template: '<div tree-view tree-options-property="treeOptions" tree-model="legend.tree"></div>',
        link: {
            pre: function (scope) {
                scope.loptions = scope.options != undefined ? scope.options : {};
                ensureDefault(scope.loptions, "map", scope.map, null);
                ensureDefault(scope.loptions, "layers", scope.loptions.layers, null);

                var template = '<span>{{node.name}}</span>'
                              + '<ul ng-if="node.legend && node.legend.length > 0" style="list-style-type: none; margin:0" ng-click="$event.stopPropagation()" style="background:white; margin-left:20px;">'
                              + '  <li ng-if="swatch.lgImage" ng-repeat="swatch in node.legend"><img height="20px" src="{{swatch.lgImage}}"/><span style="padding-bottom:5px;" > {{swatch.label}}</span></li>'
                              + '  <li ng-if="swatch.lgSVG" ng-repeat="swatch in node.legend"><span ng-html="swatch.lgSVG"/>&nbsp;{{swatch.label}}</li>'
                              + '</ul>'
                scope.treeOptions = {
                    nodeChildrenProperty: 'lgChildren',
                    nodeIsCheckedProperty: 'lgIsChecked',
                    nodeIsDisabledProperty: 'lgIsNotInScaleRange',
                    nodeIsCollapsedProperty: 'lgIsCollapsed',
                    enableCheckboxes: true,
                    nodeTemplate: template,
                    onChecked: scope.onChecked,
                };
            },
            post: function (scope, element, attrs) {
                scope.legend = new esriLegend();
                scope.legend.setNGScopingFunction(function (func) {
                    if (func)
                        $timeout(func)
                });

                scope.$watch('map', function (newval) {
                    if (newval && newval.then) {
                        scope.map.then(function (map) {
                            scope.loptions.map = map;
                        });
                    }
                    else
                        scope.loptions.map = newval;
                });
                scope.$watch('loptions.map', function (newMap) {
                    if (newMap)
                        scope.legend.startup(newMap, scope.loptions);
                });
                //if the layer settings change then redraw the legend
                scope.$watch('loptions.layers', function (newVal, oldVal) {
                    scope.legend.refresh(scope.loptions);
                });
            }
        },//end link
        controller: function ($scope) {
            $scope.onChecked = function (node) {
                $scope.legend.onChecked(node);
            }
        }
    };
}]);

function esriLegend() {
    var tree = [];

    var _map = null; //the instance of the map to monitor for the legend
    var _options = null; //options provided to the tree generation
    var _layers = {};  //properties are [layerId] and the value is the map layer
    var _nodeLookup = {}//holds a refernce to each tree node [layerId][node.id]
    var _layerOrder = []; //holds the order the layers are displayed in the map
    var _ngScopingFunc = function () { }; //function set by user to do things on the ng scope
    var _isUIEvent = false; //bool that tell events if the action was triggered from UI

    function _getLayerInfos(layer) {
        var promise = new dojo.Deferred();

        require(["esri/request", "esri/layers/ArcGISDynamicMapServiceLayer", "esri/layers/FeatureLayer"],
          function (request, ArcGISDynamicMapServiceLayer, FeatureLayer) {
              //only show the requested layers
              var isVisible = _getOptionIsLayerVisible(layer, null);
              if (!isVisible) {
                  setTimeout(function () { promise.resolve(null); }, 500);
                  return promise;
              }

              //process dynamicServiceLayer and tiled map service layers
              if (layer instanceof esri.layers.ArcGISDynamicMapServiceLayer || layer instanceof esri.layers.ArcGISTiledMapServiceLayer) {
                  request({
                      url: layer.url + '/legend',
                      content: { f: 'json' },
                      handleAs: 'json',
                      callbackParamName: 'callback',
                      load: function (result, io) {
                          //the map layer my have been removed by the time this has procesed so don't 
                          //process if not still in the map
                          var mapLayer = _map.getLayer(layer.id);
                          if (!mapLayer) {
                              promise.resolve(null);
                              return;
                          }

                          var infos = mapLayer.layerInfos;
                          //create hash for easy lookup
                          var hash = {}
                          for (var i = 0; i < result.layers.length; i++) { hash[result.layers[i].layerId] = result.layers[i]; }

                          //add properties to the info's to maintain state of each layer
                          var treeNodes = [];
                          for (var i = 0; i < infos.length; i++) {
                              var info = infos[i];
                              var result = hash[info.id];

                              info.legend = result == null ? [] : result.legend;
                              if (!(layer instanceof esri.layers.ArcGISTiledMapServiceLayer)) {
                                  for (var j = 0; j < info.legend.length; j++) {
                                      info.legend[j].lgImage = 'data:{0};base64,{1}'.format(info.legend[j].contentType, info.legend[j].imageData);
                                  }
                              }

                              //add additional properties to maintain state
                              info.lgIsExpanded = true;
                              info.lgIsChecked = info.defaultVisibility;
                              info.lgMapLayer = layer;
                              info.lgChildren = [];
                              info.lgIsNotInScaleRange = true;

                              //don't alow the users to toggle sub layers of tiles map serivces
                              if (layer instanceof esri.layers.ArcGISTiledMapServiceLayer) {
                                  info.minScale = -1;
                                  info.maxScale = -1;
                              }

                              treeNodes[info.id] = info;
                          }

                          var tree = _createTree(treeNodes, layer.id);
                          promise.resolve({
                              name: _getLayerName(layer),
                              id: layer.id,
                              minScale: layer.minScale,
                              maxScale: layer.maxScale,
                              lgChildren: tree,
                              lgMapLayer: layer,
                              lgIsMapLayer: true,
                              lgIsChecked: layer.defaultVisibility || layer.visible,
                              lgIsNotInScaleRange: true,
                              lgIsCollapsed: _getOptionIsCollapsed(layer.id),
                          })
                      },
                      error: function (error) {
                          promise.reject(error.message);
                      }
                  });
              } else { //handle graphics layers and feature layers
                  var legend = _getLegend(layer);
                  setTimeout(function () {
                      promise.resolve({
                          minScale: layer.minScale,
                          maxScale: layer.maxScale,
                          id: layer.id,
                          name: _getLayerName(layer),
                          legend: legend,
                          lgMapLayer: layer,
                          lgIsMapLayer: true,
                          lgIsNotInScaleRange: true,
                          lgIsChecked: layer.defaultVisibility || layer.visible,
                          lgIsCollapsed: _getOptionIsCollapsed(layer.id),

                      });
                  }, 500);

              }
          }
        );

        return promise;
    }
    function _getLayerName(layer) {
        if (layer.name)
            return layer.name;

        if (layer.url) {
            var eidx = layer.url.indexOf("/MapServer");
            var name = layer.url.substring(0, eidx);
            var sidx = name.lastIndexOf('/');
            if (sidx >= 0) {
                name = name.substring(sidx + 1).replace(new RegExp('_', 'g'), ' ');
                return name;
            }
        }

        return layer.id;
    }
    function _createTree(nodes, layerId) {
        var layerConfig = _options.layers ? _options.layers[layerId] : null;
        var hash = {}
        for (id in nodes) {
            var info = nodes[id];

            var isVisible = _getOptionIsLayerVisible(info.lgMapLayer, id);
            if (isVisible)
                hash[id] = info;

            if (hash[id] && nodes[info.parentLayerId]) {
                if (!nodes[info.parentLayerId].lgChildren)
                    nodes[info.parentLayerId].lgChildren = [info];
                else
                    nodes[info.parentLayerId].lgChildren.push(info);
            }
        }

        var parent = [];
        for (h in hash) {
            if (hash[h].parentLayerId < 0)
                parent.push(hash[h]);
        }

        return parent.length > 0 ? parent : null;
    }
    function _walkTreeNodes(children, parent, func) {
        if (!children || !func)
            return;

        for (var i = 0; i < children.length; i++) {
            func(children[i], parent);
            if (children[i].lgChildren)
                _walkTreeNodes(children[i].lgChildren, children[i], func);
        }
    }
    function _addToLegend(id, infos) {
        if (!infos) return;

        if (!_layers[id]) { //let's not add the same layer twice
            _layers[id] = infos;
            _ngScopingFunc(function () {
                var idx = _getLayerLegendIndexOrder(infos.lgMapLayer);
                tree.splice(idx, 0, infos);
            });
            _registerLayerEvents(_map.getLayer(id));
        } else {//update it
            tree[tree.indexOf(_layers[id])] = infos;
        }
        _setScales(id);


        //build quick lookup for each layer for allParents and allChildren
        //and build a quick lookup for each node by [layerid][node.id]
        if (!_nodeLookup[id])
            _nodeLookup[id] = {};

        if (!infos.lgChildren) {
            _nodeLookup[id] = infos;
            lgAllParentIds = [];
            lgAllChildrenIds = []
        }

        _walkTreeNodes(infos.lgChildren ? infos.lgChildren : [], null, function (n, p) {
            _nodeLookup[id][n.id] = n;

            if (!n.lgAllParentIds)
                n.lgAllParentIds = [];
            if (!n.lgAllChildrenIds)
                n.lgAllChildrenIds = []

            //set the parents for this node
            if (p) {
                var parent = p;
                while (parent) {
                    n.lgAllParentIds.push(p.id);
                    parent = _nodeLookup[id][parent.parentLayerId]
                }
            }
            //set the children
            _walkTreeNodes(n.lgChildren, n, function (n1, p1) {
                n.lgAllChildrenIds.push(n1.id);
            });
        });
    }
    function _removeFromLegend(id) {
        for (var i = 0; i < tree.length; i++) {
            if (id == tree[i].id) {
                tree.splice(i, 1);
                delete (_nodeLookup[id])
                delete (_layers[id]);
                break;
            }
        }
        //remove it from the layers list
        delete _layers[id];
    }
    function _setScales(layerId) {
        var mapScale = _map.getScale();
        var parent = null;
        var children = tree;
        if (_layers[layerId]) {
            children = [_layers[layerId]];

            if (_layers[layerId].lgChildren) {
                children = _layers[layerId].lgChildren;
                parent = _layers[layerId];
            }
        }

        if (parent)
            if ((!parent.minScale || mapScale <= parent.minScale) && (!parent.maxScale || mapScale >= parent.maxScale))
                parent.lgIsNotInScaleRange = false;
            else
                parent.lgIsNotInScaleRange = true;

        _ngScopingFunc(function () {
            _walkTreeNodes(children, parent, function (n, p) {
                if (p && p.parentLayerId)
                    n.lgIsNotInScaleRange = p.lgIsNotInScaleRange;
                else if ((!n.minScale || mapScale <= n.minScale) && (!n.maxScale || mapScale >= n.maxScale))
                    n.lgIsNotInScaleRange = false;
                else
                    n.lgIsNotInScaleRange = true;
            });
        });
    }
    function _getLayerLegendIndexOrder(layer) {
        //double check to ensure layer order is correct
        var idx = _layerOrder.length;

        //base map layers are not always set before the layer-add event completes so double
        //check index and correct if they are not in the correct order
        if (_map.basemapLayerIds && (_map.basemapLayerIds.indexOf(layer.id) > -1)) {
            idx = _map.basemapLayerIds.indexOf(layer.id);
            _layerOrder.splice(_layerOrder.indexOf(layer), 1)
            _setLayerLegendIndexOrder(layer, idx);
        }

        return idx;
    }
    function _setLayerLegendIndexOrder(layer, index) {
        _layerOrder.splice(index || _layerOrder.length, 0, layer);
    }
    function _getLegend(layer) {
        var legend = null;
        if (layer.renderer) {
            var ren = layer.renderer;
            if (ren instanceof esri.renderer.SimpleRenderer) {
                legend = [];
                //if (ren.proportionalSymbolInfo) {
                //    //handle rotational legend stuff later
                //}else{
                var html = _getCssForSmybol(ren.symbol, true);
                legend.push({ lgSVG: html });
                //}
            } else if (ren instanceof esri.renderer.UniqueValueRenderer ||
                      (ren instanceof esri.renderer.ClassBreaksRenderer)) {
                var legend = [];
                for (var i = 0; i < ren.infos.length; i++) {
                    var b = ren.infos[i];
                    legend.push({
                        lgSVG: _getCssForSmybol(b.symbol, true),
                        label: ren instanceof esri.renderer.ClassBreaksRenderer ?
                            (b.label || b.minValue + ' - ' + b.maxValue) :
                            (b.label || b.value),
                    });
                }

                if (ren.defaultSymbol) {
                    legend.push({
                        lgSVG: _getCssForSmybol(ren.defaultSymbol, true),
                        label: ren.defaultLabel || "others",
                    });
                }
            } else {
                _handleError('Unsupported renderer type.');
            }
        } else if (layer.graphics) {
            // create the legend from the symbols on the graphic
            var symbols = {}; //used to hold the unique values
            for (var i = 0; i < layer.graphics.length; i++) {
                symbols[_getCssForSmybol(layer.graphics[i].symbol, true)] = '';
            }

            if (layer.graphics.length > 0) {
                legend = [];
                for (prop in symbols)
                    legend.push({ lgSVG: prop });
            }
        }
        return legend;
    }
    function _getCssForSmybol(symbol, createSVG) {
        var defaultHeight = 17;
        var defaultWidth = 20;
        var css = '';
        if (symbol instanceof esri.symbol.SimpleFillSymbol) {
            var fill = 'fill:{0}'.format(symbol.color.toString());
            css = _getCssForSmybol(symbol.outline) + fill;
            if (createSVG) {
                var pattern = '<pattern id="lgimg" patternUnits="userSpaceOnUse" x="0" y="0" width="10" height="10"><image x="0" y="0" width="10" height="10" xlink:href="{0}{1}"></image></pattern>'.format(symbol.patternUrlPrefix);
                fill = "url(#lgimg)";
                switch (symbol.style) {
                    case esri.symbol.SimpleFillSymbol.STYLE_NULL:
                        fill = "none"
                        pattern = '';
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_BACKWARD_DIAGONAL:
                        pattern = pattern.format('backwarddiagonal.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_CROSS:
                        pattern = pattern.format('cross.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_FORWARD_DIAGONAL:
                        pattern = pattern.format('forwarddiagonal.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_DIAGONAL_CROSS:
                        pattern.format('diagonalcross.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_HORIZONTAL:
                        pattern.format('horizontal.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_VERTICAL:
                        pattern.format('vertical.png');
                        break;
                    case esri.symbol.SimpleFillSymbol.STYLE_SOLID:
                    default:
                        pattern = '';
                        fill = symbol.color.toString();
                        break;
                }

                css = '<svg width="{0}" height="{1}"><path fill="{2}" style="{3}" path="M -10,-10 L 10,0 L 10,10 L -10,10 L -10,-10 E" d="M-10-10L 10 0L 10 10L-10 10L-10-10" transform="matrix(.8,0,0,.8,15,15)"/><defs>{4}</defs></svg>'.format(defaultWidth * 1.3, defaultHeight * 1.3, fill, css, pattern);
            }
        } else if (symbol instanceof esri.symbol.SimpleMarkerSymbol) {
            var fill = "fill:{0}; fill-rule:'evenodd';".format(symbol.color.toString());
            var outline = _getCssForSmybol(symbol.outline);
            css = fill + outline;

            if (createSVG) {
                switch (symbol.style) {
                    case esri.symbol.SimpleMarkerSymbol.STYLE_CROSS:
                        css = '<svg height="{7}" width="{7}"><path style="{0}" path="M {1},{2} {1},{3} M {2},{1} {3},{1}" d="M {1} {2} {1} {3}M {2} {1} {3} {1}" transform="translate({4},{5}) rotate({6},{1},{1})" dojoGfxStrokeStyle="solid"/></svg>'.format(css, symbol.size / 2, 0, symbol.size, symbol.xoffset, symbol.yoffset, symbol.angle, symbol.size);
                        break;
                    case esri.symbol.SimpleMarkerSymbol.STYLE_DIAMOND:
                        css = '<svg height="{0}" width="{0}"><rect height="{1}" width="{2}" style="{3}" transform="translate({4},{5}) rotate({6},{7},{7})"/></svg>'.format(symbol.size * 2, symbol.size, symbol.size, css, symbol.xoffset + (symbol.size / 4), symbol.yoffset + (symbol.size / 4), symbol.angle + 45, symbol.size / 2)
                        break;
                    case esri.symbol.SimpleMarkerSymbol.STYLE_PATH:
                        css = '<svg height="{7}" width="{7}""><path style="{0}" path="{1}" d="{2}" transform="translate({3},{4}) rotate({5},{6},{6}) scale(.8, .8)" dojoGfxStrokeStyle="solid"/></svg>'.format(css, symbol.path, symbol.path.replace(new RegExp(',', 'g'), ' '), symbol.xoffset, symbol.yoffset, symbol.angle, symbol.size / 2, symbol.size * 2);
                        break;
                    case esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE:
                        css = '<svg height="{0}" width="{0}"><rect height="{1}" width="{1}" style="{2}" transform="translate({3},{4}) rotate({5},{6},{6})"/></svg>'.format(symbol.size * 2, symbol.size, css, symbol.xoffset + (symbol.size / 4), symbol.yoffset + (symbol.size / 4), symbol.angle, symbol.size / 2)
                        break;
                    case esri.symbol.SimpleMarkerSymbol.STYLE_X:
                        css = '<svg height="{7}" width="{7}"><path style="{0}" path="M {1},{2} {1},{3} M {2},{1} {3},{1}" d="M {1} {2} {1} {3}M {2} {1} {3} {1}" transform="translate({4},{5}) rotate({6},{1},{1})" dojoGfxStrokeStyle="solid"/></svg>'.format(css, symbol.size / 2, 0, symbol.size, symbol.xoffset, symbol.yoffset, symbol.angle + 45, symbol.size * 2);
                        break;
                    case esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE:
                    default:
                        css = '<svg width="{0}" height="{0}"><circle cx="{1}" cy="{1}" r="{2}" style="{3}"/></svg>'.format(symbol.size + 5, symbol.size / 2 + 2, symbol.size / 2, css)
                        break;
                }
            }
        } else if (symbol instanceof esri.symbol.PictureMarkerSymbol) {
            if (createSVG) {
                if (symbol.url) {
                    css = '<img style="margin-top:4px; padding-left:4px;" width="{0}" height="{1}" src="{2}"/>'.format(symbol.width > 20 ? 20 : symbol.width, symbol.height > 20 ? 20 : symbol.height, symbol.url);
                } else {
                    css = '<svg width="{0}" height="{1}">'.format(symbol.width * 1.5, symbol.height * 1.5)
                        + '<defs>'
                        + ' <pattern id="picPattern" patternUnits="userSpaceOnUse" x="0" y="0" height="{0}" width="{1}">'.format(symbol.height * 1.5, symbol.width * 1.5)
                        + '  <image x="{0}" y="{1}" height="{2}" width="{3}" preserveAspectRatio="none" xlink:href="{4}" transform="rotate({5},{6},{7})"></image>'.format(symbol.width * .25, symbol.height * .25, symbol.width, symbol.height, symbol.url, symbol.angle, ((symbol.width / 2) + (symbol.width * .25)), ((symbol.height / 2) + (symbol.height * .25)))
                        + ' </pattern>'
                        + '</defs>'
                        + '<rect fill="url(#picPattern)" height="{0}" width="{1}" fill-opacity="{2}" fill-rule="evenodd" transform="translate({3},{4}) scale(.8,.8)"/>'.format(symbol.height * 1.5, symbol.width * 1.5, symbol.color.a, symbol.xoffset, symbol.yoffset)
                        + '</svg>'
                }

            }
        } else if (symbol instanceof esri.symbol.SimpleLineSymbol) {
            var dasharray = 'none';
            var fill = symbol.color.toString();
            switch (symbol.style) {
                case "none":
                    fill = "none";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_DOT:
                    dasharray = "3,9"
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_DASH:
                    dasharray = '5.3,4';
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_DASHDOT:
                    dasharray = "5.3,4,1.3,4"
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_DASHDOTDOT:
                    dasharray = "10.6,4,1.3,4,1.3,4"
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_LONGDASH:
                    dasharray = "10.6,4";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_LONGDASHDOT:
                    dasharray = "10.6,4,1.3,4";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_SHORTDASH:
                    dasharray = "12,3";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_SHORTDASHDOT:
                    dasharray = "5.3,1.3,1.3,1.3";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_SHORTDASHDOTDOT:
                    dasharray = "5.3,1.3,1.3,1.3,1.3,1.3";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_SHORTDOT:
                    dasharray = "1.3,1.3";
                    break;
                case esri.symbol.SimpleLineSymbol.STYLE_SOLID:
                default:
                    dasharray = "none"
                    break;
            }
            css = "stroke:{0};stroke-width:{1};stroke-linejoin:miter;stroke-miterlimit:4;stroke-linecap:'butt';stroke-dasharray:{2};"
                .format(fill, symbol.width < 1.3 ? 1.3 : symbol.width, dasharray);
            if (createSVG)
                css = '<svg height="{0}" width="{1}"><line x1="{2}" y1="{3}" x2="{4}" y2="{5}" style="{6}"/></svg>'.format(imageHeight, imageWidth, 0, imageWidth / 2, imageWidth, imageWidth / 2, css);

        } else {
            _handleError('Unsupported symbol type.');
        }
        return css;
    };
    function _registerLayerEvents(layer) {
        if (!layer)
            return;

        //keep map layer visibility in sync with the checkbox status
        layer.on('visibility-change', function (result) {
            var linfo = _layers[layer.id];
            if (linfo) {
                _ngScopingFunc(function () {
                    if (linfo.lgIsChecked != result.visible)
                        linfo.lgIsChecked = result.visible;
                })
            }
        });

        //key dynamic layers sublayers visibility synced with checkboxes
        if (layer instanceof esri.layers.ArcGISDynamicMapServiceLayer) {
            //encapsolate this function to ensure we keep the ui checkboxes in sync
            var old = layer.setVisibleLayers;
            layer.setVisibleLayers = function (ids, refresh) {
                if (!_isUIEvent) {
                    var linfo = _layers[layer.id];

                    _ngScopingFunc(function () {
                        if (linfo && layer.visibleLayers) {
                            _walkTreeNodes(linfo.lgChildren, linfo, function (node, parent) {
                                var index = layer.visibleLayers.indexOf(node.id);

                                if (index >= 0) {
                                    if (node.lgIsChecked != true)
                                        node.lgIsChecked = true;

                                    //if child is visible, check all parents
                                    if (node.lgAllParentIds)
                                        for (var i = 0; i < node.lgAllParentIds.length; i++) {
                                            var n = _nodeLookup[layer.id][node.lgAllParentIds[i]];
                                            if (n && n.lgIsChecked != true)
                                                n.lgIsChecked = true;
                                        }

                                    //parent node is visible in ids then  makes children visible
                                    if (node.lgChildren) {
                                        for (var i = 0; i < node.lgChildren.length; i++) {
                                            var n = node.lgChildren[i];
                                            if (n && n.lgIsChecked != true)
                                                n.lgIsChecked = true;
                                        }
                                    }
                                }
                                else {
                                    if (node.lgIsChecked != false) {
                                        node.lgIsChecked = false;
                                    }
                                }
                            });
                        }
                    });
                }


                return old.apply(layer, [ids, refresh]); //return the ESRI method and keep the same scope
            };
        } else if (layer instanceof esri.layers.GraphicsLayer) {
            layer.on('graphic-add', function (r) {
                refresh(_options, layer);
            });
            layer.on('graphic-remove', function (r) {
                refresh(_options, layer)
            })
        }

    }
    function _registerMapEvents() {
        if (!map) return;
        //map loading
        _map.on('load', function () {
            _setScales();
        });

        //added layers
        var idx = 0;
        _map.on('layer-add', function (args) {
            var lyr = args.layer;
            //keep track of the layer render order
            _setLayerLegendIndexOrder(lyr);

            if (!_layers[lyr.id]) {
                var p = _getLayerInfos(lyr)

                if (p)
                    p.then(function (infos) {
                        _addToLegend(lyr.id, infos);
                    }, function (error) {
                        _handleError(error);
                    })
            }
        });

        //remove layer
        _map.on('layer-remove', function (args) {
            var idx = _layerOrder.indexOf(args.layer); //keep track of the layer render order
            if (idx >= 0)
                _layerOrder.splice(idx, 1);

            _removeFromLegend(args.layer.id);
        })

        //extent changes
        _map.on('extent-change', function (args) {
            if (!args.levelChange)
                return;

            _setScales();
        });
    }
    function _getOptionIsLayerVisible(layer, subLayerId) {
        if (!_options || !_options.layers)
            return true;
        if (!layer)
            return false;

        var othersVisible = _options.layers["*"] && _options.layers["*"].show === true;
        var layerSettings = _options.layers[layer.id];
        var layerExpliclitVisible = layerSettings ? layerSettings.show === true : false;
        var layerSubIds = layerSettings ? layerSettings.subLayerIds : undefined;

        var isLayerVisible = layerExpliclitVisible || (!layerExpliclitVisible && othersVisible);

        if (layerSubIds != undefined)
            if(isLayerVisible){
                return (!subLayerId || (layerSubIds && layerSubIds.indexOf(parseInt(subLayerId, 10)) > -1));
            }else{
                return (!subLayerId || (layerSubIds && layerSubIds.indexOf(parseInt(subLayerId, 10)) == -1));
            }
        else
            return isLayerVisible;
    }
    function _getOptionIsCollapsed(layerid) {
        return (_options && _options.layers &&
            (_options.layers[layerid] != undefined && _options.layers[layerid].collapsed == true) ||
            (_options.layers[layerid] == undefined && _options.layers["*"] != undefined && _options.layers["*"].collapsed == true)) ? true : undefined;
    }
    function _handleError(error) {
        console.error("Legend Error:" + error);
    }


    function onChecked(node) {
        if (!node || !node.lgMapLayer) {
            _isUIEvent = false;
            return;
        }

        _isUIEvent = true;
        var lyr = node.lgMapLayer;
        if (lyr instanceof esri.layers.ArcGISDynamicMapServiceLayer) {
            var setVisibleLayers = function (visibleIds) {
                if (visibleIds.length == 0)
                    visibleIds.push(-1);
                lyr.setVisibleLayers(visibleIds);
            };

            if (!node.parentLayerId)
                lyr.setVisibility(node.lgIsChecked);
            else if (node.lgChildren && node.lgChildren.length > 0) {
                _walkTreeNodes(node.lgChildren, node, function (n, p) {
                    if (!n.lgChildren || n.lgChildren.length == 0) {
                        var idx = lyr.visibleLayers.indexOf(n.id);
                        if (n.lgIsChecked && idx < 0) {
                            lyr.visibleLayers.push(n.id);
                        }
                        else if (!n.lgIsChecked && idx >= 0) {
                            lyr.visibleLayers.splice(idx, 1);
                        }
                    }
                });
                setVisibleLayers(lyr.visibleLayers);
            } else {
                if (node.lgIsChecked) {
                    lyr.visibleLayers.push(node.id)
                    setVisibleLayers(lyr.visibleLayers);
                }
                else {
                    var idx = lyr.visibleLayers.indexOf(node.id);
                    if (idx >= 0)
                        lyr.visibleLayers.splice(idx, 1);

                    idx = lyr.visibleLayers.indexOf(node.parentLayerId);
                    if (idx >= 0)
                        lyr.visibleLayers.splice(idx, 1);

                    setVisibleLayers(lyr.visibleLayers);
                }
            }
        } else if (lyr.setVisibility)
            lyr.setVisibility(node.lgIsChecked);

        _isUIEvent = false;
    }
    function startup(map, options) {
        if (!map) {
            throw "Map is required";
        }
        _map = map;
        _registerMapEvents();
        return refresh(options);
    }
    function refresh(options, layer) {
        _options = options;
        var lyrsToRefresh = [];

        //put a list of layers together to refresh
        if (layer)
            lyrsToRefresh.push(layer);
        else {
            for (var i = 0; i < _map.layerIds.length; i++) {
                lyrsToRefresh.push(_map.getLayer(_map.layerIds[i]));
            }
            for (var i = 0; i < _map.graphicsLayerIds.length; i++) {
                lyrsToRefresh.push(_map.getLayer(_map.layerIds[i]));
            }
        }

        //process each layer and signal when it's done
        var promise = new dojo.Deferred();

        function attemptToResolvePromise(index) {
            if (index == lyrsToRefresh.length - 1)
                promise.resolve(tree);
        }
        for (var i = 0; i < lyrsToRefresh.length; i++) {
            (function (index) {
                try {
                    var lyr = lyrsToRefresh[index];
                    var id = lyr.id;

                    var p = _getLayerInfos(lyr);
                    if (p)
                        p.then(function (infos) {
                            if (infos)
                                _addToLegend(id, infos)
                            attemptToResolvePromise(index);
                        }, function (error) {
                            _handleError(error)
                            attemptToResolvePromise(index);
                        })
                } catch (e) {
                    _handleError(e);
                }
            })(i);
        }

        return promise;
    }

    return {
        startup: startup,
        refresh: refresh,
        onChecked: onChecked,
        tree: tree,
        setNGScopingFunction: function (func) {
            _ngScopingFunc = func;
        }
    }
}