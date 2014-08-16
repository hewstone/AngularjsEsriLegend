(function (angular) {
    'use strict';
    var treeUniqueIds = 0;
    angular.module('angularTreeview', [])
        .directive('ngHtml', ['$compile', function ($compile) {
            return function (scope, elem, attrs) {
                if (attrs.ngHtml) {
                    elem.html(scope.$eval(attrs.ngHtml));
                    $compile(elem.contents())(scope);
                }
                scope.$watch(attrs.ngHtml, function (newValue, oldValue) {
                    if (newValue && newValue !== oldValue) {
                        elem.html(newValue);
                        $compile(elem.contents())(scope);
                    }
                });
            };
        }])
        .directive('uiIndeterminate', [
          function () {
              return {
                  compile: function (tElm, tAttrs) {
                      if (!tAttrs.type || tAttrs.type.toLowerCase() !== 'checkbox') {
                          return angular.noop;
                      }

                      return function ($scope, elm, attrs) {
                          $scope.$watch(attrs.uiIndeterminate, function (newVal) {
                              elm[0].indeterminate = !!newVal;
                          });
                      };
                  }
              };
          }])
        .directive('treeView', ['$compile', "$parse", function ($compile, $parse) {
            var _ensureDefault = function (options, attrs, prop, defaultValue, replaceValue) {
                if (!options.hasOwnProperty(prop) || replaceValue) {

                    //convert string 'true' or 'false' to boolean values
                    if (attrs[prop] != null) {
                        if (attrs[prop] == "")
                            options[prop] = true;
                        else if (attrs[prop].toLowerCase().indexOf('true') == 0 || attrs[prop].toLowerCase().indexOf('false') == 0) {
                            options[prop] = attrs[prop].toLowerCase() == 'true';
                        } else {
                            options[prop] = attrs[prop];
                        }
                    } else
                        options[prop] = attrs[prop];

                    if (options[prop] == undefined && defaultValue)
                        options[prop] = defaultValue;
                } else if (replaceValue) {
                    options[prop] = defaultValue;
                }
            }


            var _setCheckedRecursive = function (scope, node, value) {
                node[scope.treeOptions.nodeIsCheckedProperty] = value;

                //handle the children
                var children = node[scope.treeOptions.nodeChildrenProperty];
                if (children != null && children.length > 0) {
                    angular.forEach(children, function (childNode, index) {
                        _setCheckedRecursive(scope, childNode, value);
                    });
                }
            }

            var _getCheckedChildCount = function (scope, node) {
                var childProp = scope.treeOptions.nodeChildrenProperty;
                var checkedProp = scope.treeOptions.nodeIsCheckedProperty;
                var cnt = 0;
                if (node[childProp] && node[childProp].length > 0) {
                    for (var i in node[childProp])
                        cnt += _getCheckedChildCount(scope, node[childProp][i]);
                } else if (node[checkedProp] == true) {
                    cnt++;
                }

                return cnt;
            }

            var _getChildCount = function (scope, node) {
                var childProp = scope.treeOptions.nodeChildrenProperty;
                var cnt = 0;
                if (node[childProp] && node[childProp].length > 0) {
                    for (var i in node[childProp])
                        cnt += _getChildCount(scope, node[childProp][i]);
                } else {
                    cnt++;
                }
                return cnt;
            }

            var _updateIndeterminateState = function (scope, node) {
                //set the value of the node
                var isCheckedProp = scope.treeOptions.nodeIsCheckedProperty;
                var childProp = scope.treeOptions.nodeChildrenProperty;

                var checked = _getCheckedChildCount(scope, node);
                var total = _getChildCount(scope, node);
                if (checked == total)
                    node[isCheckedProp] = true;
                else
                    node[isCheckedProp] = false;

                if (scope.treeOptions.enableCascadeChecking) {
                    if (checked > 0 && checked < total)
                        node.isIndeterminate = true;
                    else
                        node.isIndeterminate = undefined;
                }

                //handle the children
                if (node[childProp] && node[childProp].length > 0) {
                    for (var i in node[childProp])
                        _updateIndeterminateState(scope, node[childProp][i]);
                }
            }

            /*
			* Returns 0 for not found; 1 node matched; 2 parent matched
			*/
            var _hasVisibleAncestor = function (scope, node, expression) {
                var childProp = scope.treeOptions.nodeChildrenProperty;

                var visible = $parse(expression)(scope, { node: node });
                if (visible)
                    return 1;


                //handle the children
                if (node[childProp] && node[childProp].length > 0) {
                    for (var i in node[childProp]) {
                        var found = _hasVisibleAncestor(scope, node[childProp][i], expression);
                        if (found)
                            return 2;
                    }
                }

                return 0;
            }

            var _generateTemplate = function (treeId, treeModel, scope, element) {
                var nodeId = scope.treeOptions.nodeIdProperty;//node id
                var nodeLabel = scope.treeOptions.nodeLabelProperty;//node label
                var nodeChildren = scope.treeOptions.nodeChildrenProperty;//children
                var enableCheckboxes = scope.treeOptions.enableCheckboxes;
                var nodeChecked = scope.treeOptions.nodeIsCheckedProperty;
                var nodeDisabled = scope.treeOptions.nodeIsDisabledProperty;
                var enableCascadeChecking = scope.treeOptions.enableCascadeChecking;
                var treeNodeTemplate = scope.treeOptions.nodeTemplate;
                var treeOptionsProperty = scope.treeOptions.treeOptionsProperty;
                var nodeExpliclitProperty = scope.treeOptions.nodeTemplateProperty;
                var nodeFilter = scope.treeOptions.nodeFilter;
                var nodeCollapsedProp = scope.treeOptions.nodeIsCollapsedProperty;

                //tree template
                var nodeTemplate = '{{node.' + nodeLabel + '}}';
                if (treeNodeTemplate != null) {
                    nodeTemplate = treeNodeTemplate;
                } else {
                    var transcodeTemplateKey = "transcodeTemplate";

                    if (!scope.treeOptions[transcodeTemplateKey]) {
                        //transclude the html as a template if it's there
                        var content = "";
                        try {
                            content = element[0].children[0];
                        } catch (ex) {
                            ;
                        }
                        if (content != null) {
                            content = content.innerHTML.replace("\n", "").trim();
                            if (content != "") {
                                nodeTemplate = content;
                                scope.treeOptions[transcodeTemplateKey] = nodeTemplate;
                            }
                        }
                    } else
                        nodeTemplate = scope.treeOptions[transcodeTemplateKey];

                }

                //if the node has an expliclit template defined us it
                if (nodeExpliclitProperty != undefined) {
                    nodeTemplate = '<span ng-if="node.' + nodeExpliclitProperty + '" ng-html="node.' + nodeExpliclitProperty + '"></span><span ng-if="node.' + nodeExpliclitProperty + ' == undefined">' + nodeTemplate + '</span>';
                }

                if (enableCheckboxes) {
                    var checkboxTemplate = '<input type="checkbox" style="margin-left:0; margin-right:5px;" ng-model="node.' + nodeChecked + '" ui-indeterminate="node.isIndeterminate" ng-checked="node.' + nodeChecked + '" ng-disabled="node.' + nodeDisabled + '" ng-click="' + treeId + '.toggleNodeChecked(node); $event.stopPropagation()" />';
                    nodeTemplate = checkboxTemplate + nodeTemplate;
                }

                var filter = 'ng-show="' + treeId + '.filterNode(node, \'' + nodeFilter + '\')"';
                //for the children scope add the node template
                var template =
                    '<ul>' +
                        '<li data-ng-repeat="node in ' + treeModel + '" ' + filter + '>' +
                            '<i class="toggle fa fa-caret-right" data-ng-show="node.' + nodeChildren + '.length && node.' + nodeCollapsedProp + '" data-ng-click="' + treeId + '.selectNodeHead(node)"></i>' +
                            '<i class="toggle fa fa-caret-down" data-ng-show="node.' + nodeChildren + '.length && !node.' + nodeCollapsedProp + '" data-ng-click="' + treeId + '.selectNodeHead(node)"></i>' +
                            '<i class="no-toggle" data-ng-hide="node.' + nodeChildren + '.length"></i>' +
                            '<span data-ng-class="node.selected" data-ng-click="' + treeId + '.selectNodeLabel(node)">' + nodeTemplate + '</span>' +
                            '<div tree-view child-tree ng-hide="node.' + nodeCollapsedProp + '" tree-options-property="' + treeOptionsProperty + '" tree-model="node.' + nodeChildren + '"></div>' +
                        '</li>' +
                    '</ul>';

                return template;
            }

            return {
                restrict: 'A',
                scope: true,
                transclude: true,
                template: '<span name="content" ng-transclude></span>',
                link: function (scope, element, attrs) {
                    //create a internal options to bind to
                    var optionsProperty = attrs["treeOptionsProperty"] != null ? attrs["treeOptionsProperty"] : "options";

                    //check up the parent to find the correct scope for the options
                    var options = scope[optionsProperty];
                    if (options == null) {
                        var parent = scope.$parent;
                        while (options == null && parent != null) {
                            var prop = parent[attrs[optionsProperty]];
                            if (!(prop == undefined))
                                options = prop;

                            parent = parent.$parent;
                        }
                    }
                    if (options == null)
                        options = {};

                    scope["treeOptions"] = options; //treeOptions property on the scope will be what is referenced internally for settings
                    _ensureDefault(options, attrs, "treeOptionsProperty", 'treeOptions');
                    _ensureDefault(options, attrs, "treeId", 'treeview' + (++treeUniqueIds));
                    _ensureDefault(options, attrs, "treeModel", null, true);
                    _ensureDefault(options, attrs, "rootModel", options.treeModel, false);
                    _ensureDefault(options, attrs, "nodeIdProperty", "id");
                    _ensureDefault(options, attrs, "nodeLabelProperty", 'label');
                    _ensureDefault(options, attrs, "nodeChildrenProperty", 'children');
                    _ensureDefault(options, attrs, "nodeIsCheckedProperty", 'checked');
                    _ensureDefault(options, attrs, "nodeIsDisabledProperty", 'disabled');
                    _ensureDefault(options, attrs, "nodeIsCollapsedProperty", 'collapsed');
                    _ensureDefault(options, attrs, "enableCheckboxes", false);
                    _ensureDefault(options, attrs, "enableCascadeChecking", false);
                    _ensureDefault(options, attrs, "enableHighlighting", false);
                    _ensureDefault(options, attrs, "nodeTemplateProperty", undefined); //this allow a property on the node to be the template for the node
                    _ensureDefault(options, attrs, "nodeTemplate", null, false); //this allows complex templates with directives to be used
                    _ensureDefault(options, attrs, "nodeFilter", true);
                    _ensureDefault(options, attrs, "nodeFilterModel", null);
                    _ensureDefault(options, attrs, "onSelection", null); //fires when a node is selected
                    _ensureDefault(options, attrs, "onChecked", null); //fires when a node is checked or unchecked

                    var treeId = scope.treeOptions.treeId;
                    var treeModel = scope.treeOptions.treeModel;
                    var enableCascadeChecking = scope.treeOptions.enableCascadeChecking;
                    var nodeChecked = scope.treeOptions.nodeIsCheckedProperty;
                    var nodeDisabled = scope.treeOptions.nodeIsDisabledProperty;
                    var enableHighlighting = scope.treeOptions.enableHighlighting;
                    var checkedEvent = scope.treeOptions.onChecked;
                    var selectionEvent = scope.treeOptions.onSelection;
                    var nodeFilterModel = scope.treeOptions.nodeFilterModel;
                    var nodeCollapsedProp = scope.treeOptions.nodeIsCollapsedProperty;


                    var template = _generateTemplate(treeId, treeModel, scope, element);


                    //check tree id, tree model
                    if (treeModel) {

                        //root node
                        if (!attrs.childTree) {

                            //create tree object if not exists
                            scope[treeId] = scope[treeId] || {};

                            //if node head clicks,
                            scope[treeId].selectNodeHead = scope[treeId].selectNodeHead || function (selectedNode) {
                                //Collapse or Expand
                                selectedNode[nodeCollapsedProp] = !selectedNode[nodeCollapsedProp];
                            };

                            //if node label clicks,
                            scope[treeId].selectNodeLabel = scope[treeId].selectNodeLabel || function (selectedNode) {
                                if (selectedNode[nodeDisabled] == "true" ||
                                    selectedNode[nodeDisabled] === true) //don't allow selection on disabled nodes
                                    return;

                                //remove highlight from previous node
                                var oldSelectedNode = null;
                                if (scope[treeId].currentNode) {
                                    oldSelectedNode = scope[treeId].currentNode;
                                    if (scope[treeId].currentNode.selected)
                                        oldSelectedNode.selected = undefined;
                                }

                                //set highlight to selected node
                                if (enableHighlighting == true)
                                    selectedNode.selected = 'selected';
                                else
                                    scope[treeId].toggleNodeChecked(selectedNode);

                                //set currentNode
                                scope[treeId].currentNode = selectedNode;

                                if ((oldSelectedNode != null || selectedNode != null) && selectionEvent) {
                                    $parse(selectionEvent)(oldSelectedNode, selectedNode);
                                }
                            };

                            //if enable checkboxes are checked and it's cascade is checked
                            if (scope.treeOptions.enableCheckboxes) {
                                scope.$watch(scope[treeModel], function (newVal, oldVal) {
                                    if (enableCascadeChecking) {
                                        angular.forEach(scope[treeModel], function (node, index) {
                                            _setCheckedRecursive(scope, node, node[nodeChecked] == undefined ? false : node[nodeChecked])
                                        });

                                        angular.forEach(scope[treeModel], function (node, index) {
                                            _updateIndeterminateState(scope, node);
                                        });
                                    }
                                });
                            }

                            //handle filtering
                            scope[treeId].filterNode = scope[treeId].filterNode || function (node, expression) {
                                var show = _hasVisibleAncestor(scope, node, expression);

                                //highlight the matching nodes
                                if (show == 1 && scope[nodeFilterModel] != undefined && scope[nodeFilterModel].length > 0)
                                    node.selected = 'selected';
                                else
                                    node.selected = undefined;

                                return show > 0;
                            }

                            //handle checkbox toggle
                            scope[treeId].toggleNodeChecked = scope[treeId].toggleNodeChecked || function (node) {
                                var value = !node[nodeChecked];

                                if (enableCascadeChecking) {
                                    _setCheckedRecursive(scope, node, value);
                                    angular.forEach(scope[scope.treeOptions.rootModel], function (childNode, index) {
                                        _updateIndeterminateState(scope, childNode);
                                    });
                                } else {
                                    node[nodeChecked] = value;
                                }

                                //fire the checked event
                                if (node && checkedEvent)
                                    $parse(checkedEvent)(node);
                            }
                        }

                        //Rendering template.
                        element.html('').append($compile(template)(scope));
                    }
                }
            };
        }]);
})(angular);