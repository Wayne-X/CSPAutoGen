/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/9/13
 * Time: 11:03 AM
 * To change this template use File | Settings | File Templates.
 */
twc.shared.apps.provider('twcConfig',function () {
  var config = {};
  var overrideList = [];

  return {
    /**
     * This is made to be used in tests to override the defined settings
     * @param settings
     */
    __override__: function (settings) {
      overrideList.push(settings);
    },

    /**
     * This is the standard way to declare configurations
     * @param settings
     */
    add: function (settings) {
      angular.extend(config,settings);
    },

    $get: ['twcUtil', function (twcUtil) {
      angular.forEach(overrideList, function (overridingSettings) {
        twcUtil.deepExtend(config,overridingSettings);
      });
      return config;
    }]
  };
});

/**
 * User: ksankaran
 * Create a new provider for twcMessage. We can probably use one function and make two
 * factories from it. However, the message needs deep extend but config doesn't need
 * and we may increase complex by doing it for configs.
 */
twc.shared.apps.provider('twcMessage', function () {
  var config = {};

  return {
    deepExtend: function (destination) {
      var sources = Array.prototype.slice.call(arguments,1), _self = this;
      angular.forEach(sources, function (source) {
        angular.forEach(source,function (value,property) {
          if (value && angular.isObject(value)) {
            destination[property] = destination[property] || {};
            _self.deepExtend(destination[property], value);
          } else {
            destination[property] = value;
          }
        });
      });
    },

    /**
     * This is the standard way to declare configurations
     * @param settings
     */
    add: function (settings) {
      this.deepExtend(config,settings);
    },

    getAll: function (key) {
      return config;
    },

    $get: function () {
      return config;
    }
  };
});
;
(function (angular, $LAB) {

  angular.module('shared')
    .factory('AsyncLoader', AsyncLoaderFactory);

  AsyncLoaderFactory.$inject = ['PromisePool', '$q', 'twcUtil'];

  function AsyncLoaderFactory(PromisePool, $q, twcUtil) {
    var pmpool = new PromisePool(), fileMap = {};
    return {
      loadJSFiles: function (fileNames, version) {
        // fileMap contains the list of files that are already loaded.
        var filteredNames = [];
        var promises = [];
        for (var idx = 0, len = fileNames.length; idx < len; idx++) {
          var slashName = '/' + fileNames[idx];
          if (!fileMap[fileNames[idx]]) {
            filteredNames.push(slashName);
            fileMap[fileNames[idx]] = 1;
          }
          // create a promise for that name.
          pmpool.createDefer(slashName);
          // Add it to list of promises and this call need to wait on.
          promises.push(pmpool.getPromise(slashName));
        }

        if (filteredNames && filteredNames.length) {
          $LAB.script(twcUtil.map(filteredNames, function (fName) {
            if (version) {
              return fName + '?v=' + version;
            }

            return fName;
          }))
          .wait(function () {
            angular.forEach(filteredNames, function (filteredName) {
              pmpool.resolveDefer(filteredName);
            });
          });
        }

        // return the wrapper promise will all the subpromises
        return $q.all(promises);
      }
    };
  }

})(window.angular, window.$LAB);
;
/**
 * Shared instance directive. This is used to provide a relationship between widget unique ID from Drupal
 * and the angular app it represents.
 */
(function (angular, Drupal, domready, glue, callPhantom) {
  angular.module('shared').
    directive('twcController', TwcControllerDirective);

  TwcControllerDirective.$inject = ['$controller', 'DrupalSettings', '$log', 'PcoPage', '$templateCache', '$http', '$compile', 'throttler', 'AsyncLoader', 'customEvent'];

  function TwcControllerDirective($controller, DrupalSettings, $log, PcoPage, $templateCache, $http, $compile, throttler, AsyncLoader, customEvent) {
    return {
      scope: true,
      replace: false,
      transclude: false,
      compile: function () {
        return {
          pre: function (scope, elem, attrs) {
            var settings = DrupalSettings.getSettings(attrs.instance);
            var logger = $log.getInstance(attrs.twcController);
            var ret = {settings: settings, logger: logger};
            var moduleName = attrs.moduleName;
            var filesMap = ((moduleName && Drupal.settings.twc.files && Drupal.settings.twc.files[moduleName]) || {});
            var version = settings && settings.module_version || '';
            var filesToLoad = [];
            var createCtrl = function () {
              var isChildrenNotCompiled = elem.children().attr('data-ng-non-bindable');
              if (isChildrenNotCompiled) {
                // remove the additional dom we attached.
                elem.children().children().appendTo(elem);
                elem.children('[data-ng-non-bindable]').remove();
              }
              $controller(attrs.twcController, ret);
              attrs.$set('twcInit', undefined);
              elem.removeClass('twc-init');
              return isChildrenNotCompiled;
            };
            var ajaxPageStateJS = (Drupal.settings.ajaxPageState && Drupal.settings.ajaxPageState.js) || {};

            angular.forEach(filesMap, function (value, fileName) {
              if (!ajaxPageStateJS[fileName]) {
                filesToLoad.push(fileName);
              }
            });

            // Sort files based on group and weight
            filesToLoad.sort(function (file1, file2) {
              var loadData1 = filesMap[file1], loadData2 = filesMap[file2];
              // default values
              loadData1.group   = loadData1.group   || 5;
              loadData1.weight  = loadData1.weight  || 10;
              loadData2.group   = loadData2.group   || 5;
              loadData2.weight  = loadData2.weight  || 10;

              return (loadData1.group === loadData2.group) ? (function () {
                return (loadData1.weight === loadData2.weight) ? 0 : ((loadData1.weight < loadData2.weight) ? -1 : 1);
              })() : ((loadData1.group < loadData2.group) ? -1 : 1);
            });

            angular.extend(ret, {$scope: scope});

            // Conditional load rules
            if (settings.conditional_load_viewport) {
              var conditionalViewportRules = {
                'load_on_tablet': settings.conditional_viewport_load_on_tablet,
                'load_on_mobile': settings.conditional_viewport_load_on_mobile,
                'load_on_desktop': settings.conditional_viewport_load_on_desktop
              };

              if (PcoPage.getScreenSize() === 'mobileSized' && !conditionalViewportRules.load_on_mobile) {
                elem.remove();
                return;
              }

              if (PcoPage.getScreenSize() === 'tabletSized' && !conditionalViewportRules.load_on_tablet) {
                elem.remove();
                return;
              }

              if (PcoPage.getScreenSize() === 'desktopSized' && !conditionalViewportRules.load_on_desktop) {
                elem.remove();
                return;
              }
            }

            if (settings.conditional_load_browser) {
              var conditionalBrowserRules = {
                'load_on_ie_less_equal_ten': settings.conditional_browser_load_ie_less_equal_ten
              };

              // If it does not match IE and load rule is on for IE,
              // don't load module
              if ((!!!navigator.userAgent.match(/(msie\s(10\.0|[5-9]))/i) &&
                conditionalBrowserRules.load_on_ie_less_equal_ten)) {
                elem.remove();
                return;
              }
            }

            // Check if lazyload is disabled
            if (TWC.Configs.disable_lazyload) {
              createCtrl() ? $compile(elem.contents())(scope) : angular.noop();
              return;
            }

            // Create controller after listening to PcoPage promises so the above callback gets executed
            // before controller listen.
            if (attrs.templateFile) {

              !callPhantom && throttler.onScrollThrottle(function () {
                customEvent.getEvent('scrollFired').resolve();
              });

              var lazyload = function () {
                // check if compiled before continuing
                // return if compiled already
                if (attrs.compiled) {
                  return;
                }

                glue && glue.timer('module.' + moduleName + '.lazyload', 'Time it takes to load a lazy loaded module for instance ' + attrs.instance).start();

                // set compiled to true and continue to load
                attrs.$set('compiled', true);
                return AsyncLoader.loadJSFiles(filesToLoad, version)
                  .then(function () {
                    createCtrl();
                    // get template file and compile

                    if ($templateCache.get(attrs.templateFile)) {
                      return $templateCache.get(attrs.templateFile);
                    }

                    var params = {};

                    if (version) {
                      params = {
                        'params': {
                          'v': version
                        }
                      };
                    }

                    return $http.get(attrs.templateFile, params)
                      .then(function (data) {
                        // return template and not response object
                        $templateCache.put(attrs.templateFile, data.data);
                        return data.data;
                      });
                  })
                  .then(function (data) {
                    $log.debug('Loaded template file for: ', attrs.templateFile);
                    elem.html(data);
                    $compile(elem.contents())(scope);
                    glue && glue.timer('module.' + moduleName + '.lazyload').end();
                  });
              };

              customEvent.getEvent('scrollFired')
                .then(function () {
                  return lazyload();
                });

              domready(function () {
                if (!callPhantom && TWC.PcoUtils.isInViewPort(elem) || callPhantom) {
                  return lazyload();
                }
              });
            } else {
              // There is no template file. So the module has already loaded its template.
              // It will look ugly if we dont do our magic 'now'.
              AsyncLoader.loadJSFiles(filesToLoad, version).then(function () {
                // Its a tpl.php or esi magic. In either case, it is ready to compile.
                createCtrl() ? $compile(elem.contents())(scope) : angular.noop();
              });
            }
          }
        };
      },
      controller: TwcControllerDirectiveController
    };
  }

  TwcControllerDirectiveController.$inject = ['$scope', '$element', '$attrs', 'DrupalSettings'];

  function TwcControllerDirectiveController($scope, $element, $attrs, DrupalSettings) {
    $scope.getInstance = function () {
      return DrupalSettings.getSettings($attrs.instance);
    };
  }
})(window.angular, window.Drupal, window.domready, window.glue, window.callPhantom);
;
/**
 * Author: ksankaran (Velu)
 * Date: 3/6/14
 * Time: 2:50 PM
 * Comments:
 */

twc.shared.apps.config(['twcConfigProvider',function (twcConfigProvider) {
  twcConfigProvider.add(
        {
          // Module status namespace
          module_status_codes:{
            LOADING: 'loading',
            NOT_AVAILABLE: 'na',
            ERROR: 'error',
            DEFAULT: 'default'
          }
        });
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/9/13
 * Time: 11:03 AM
 * To change this template use File | Settings | File Templates.
 */
/*jshint -W030 */
twc.shared.apps.factory('TwcModel',['TwcClass','twcUtil',function (TwcClass,twcUtil) {
  return TwcClass.extend({

    requiredAttrs: [],

    construct: function (attrs,config) {
      this.attrs = angular.copy(this.defaults) || {};
      angular.forEach(this.requiredAttrs,function (reqAttr) {
        if (attrs[reqAttr] === undefined) {
          throw 'Attribute "' + reqAttr + '" is required!';
        }
      });
      this.fromDto(attrs);
      this.init && this.init(attrs,config);
    },

    fromDto: function (dto) {
      this.set(dto);
      return this;
    },

    /**
     * Returns the value of the associated key in the `attrs` property
     * @param key
     * @returns {*}
     */
    _get: function (key) {
      if (arguments.length === 2) {
        var defaultVal = arguments[1];
        var val = this.attrs[key];
        if (!val && val !== defaultVal) {
          this._set(key,defaultVal);
        }
      }
      return this.attrs[key];
    },

    /**
     * Set the value of the associated key in the `attrs` property
     * @param key
     * @param val
     * @returns {*}
     * @private
     */
    _set: function (key,val) {
      if (angular.isObject(key)) {
        angular.extend(this.attrs,arguments[0]);
      } else {
        this.attrs[key] = val;
      }
      return this;
    },

    /**
     * If there is a model.getKey(param1,param2) method, we can conveniently call model.get(key,param1,param2).
     * @param key
     * @returns {*}
     */
    get: function (key) {
      var method = 'get' + twcUtil.capitalize(key);
      if (this[method]) {
        return this[method].apply(this,twcUtil.rest(arguments));
      } else {
        return this._get.apply(this,arguments);
      }
    },

    /**
     * If there is a model.setKey(val,param1,param2) method, we can conveniently make one of these calls:
     * - model.set(key,val,param1,param2)
     * - model.set({key:val},{key:[param1,param2]})
     * key - can be a string key or a {key: value} object
     * val - if key is an object, this will become additional params to pass into the setter for example {key: [param1,param2]}
     * @param key
     * @param val
     * @returns this
     */
    set: function (key) {
      if (angular.isObject(key)) {
        var attrs = key;
        var additionalSettings = arguments[1] || {};
        var self  = this;
        angular.forEach(attrs,function (val,key) {
          self.set.apply(self,[key,val].concat(additionalSettings[key] || []));
        });
        return this;
      } else if (key) {
        var method = 'set' + twcUtil.capitalize(key);
        if (this[method]) {
          return this[method].apply(this, twcUtil.rest(arguments));
        } else {
          return this._set.apply(this,arguments);
        }
      }
    },

    mapTo: function (model,attrs,mapRules) {
      mapRules = mapRules || {};
      var self = this;
      angular.forEach(attrs,function (fromAttr) {
        var toAttr = mapRules[fromAttr] || fromAttr;
        model.set(toAttr,self.get(fromAttr));
      });
      return model;
    }
  });
}]);
;
/**
 * User: Jeff Lu
 * Date: 3/5/2015
 * Time: 10:44
 *
 * twc-modal is intended to be the common all purpose dialogbox and will be replacing twc_dialog-box and others in the codebase
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcModal',['ModalBox', 'twcConstant', function (ModalBox, twcConstant) {
  'use strict';
  var ascii = twcConstant.ascii;
  var templatePath = '/sites/all/modules/custom/angularmods/app/shared/twc_dialog_box/templates/',
    defaultTemplate = 'twc_modal.html';
  return {
    template: '<span ng-click="showDialog()" ng-transclude></span>',
    transclude: true,
    restrict: 'EA',
    scope: {
      title: '@',
      body: '@',
      okText: '@',
      cancelText: '@',
      okAction: '&',
      cancelAction: '&',
      showIt: '='
    },
    controller: function ($scope, $timeout, twcConstant) {
      $scope.hideDialog = function () {
        $scope.$evalAsync(function () {
          $scope.show = false;
          $scope.showIt = false;
        });
      };

      $scope.keyPressBindings = [
        {
          id: 'Escape',
          keyCode: twcConstant.ascii.ESC,
          action: function () {
            $scope.hideDialog();
          }
        }
      ];
      $scope.ok = function () {
        $scope.hideDialog();
        $timeout(function () { $scope.okAction(); }, 0, false);
      };

      $scope.cancel = function () {
        $scope.hideDialog();
        $timeout(function () { $scope.cancelAction(); }, 0, false);
      };
    },
    link: function postLink(scope, element, attrs, controller) {
      scope.$watch('showIt', function (nVal, oVal) {
        if (nVal && JSON.parse(nVal) === true) {
          var popup = ModalBox.showDialog(scope, attrs);
        } else {
          scope.hideDialog();
        }
      });
      attrs.$observe('dialogTemplate', function (nVal, oVal) {
        scope.$evalAsync(function () {
          scope.template = attrs.dialogTemplate ? attrs.dialogTemplate : templatePath + 'dialog.html';
        });
      });
      attrs.$observe('body', function (nVal, oVal) {
        ModalBox.showDialog(scope, attrs);
      });
    }
  };

}]).factory('ModalBox', ['$compile', '$document', '$sce', function ($compile, $document, $sce) {
  var dialogBox = {};
  var templatePath = '/sites/all/modules/custom/angularmods/app/shared/twc_dialog_box/templates/',
    defaultTemplate = 'twc_modal.html';

  return {
    getPopup: function (scope) {
      if (!dialogBox[scope.$id]) {
        dialogBox[scope.$id] = '<div class="twc-modal" data-ng-if="show" data-twc-key-press="keyPressBindings"><div data-ng-include="template"></div>';
        angular.element($document[0].body).append($compile(dialogBox[scope.$id])(scope));
        var div = angular.element($document[0].body).find('div');
        dialogBox[scope.$id] = div[div.length - 1];
      }
      $compile(dialogBox[scope.$id])(scope);

      return dialogBox[scope.$id];
    },
    showDialog: function (scope, attrs) {
      var style = {width: '500px', height: '100px'},
        popup = this.getPopup(scope);
      scope.buttonState = scope.okAction ? 'ok-cancel' : 'cancel';
      scope.okText = attrs.okText ? attrs.okText : 'OK';
      scope.cancelText = attrs.cancelText ? attrs.cancelText : 'Cancel';
      scope.hasHeader = attrs.header ? true : false;
      scope.headerContent = attrs.header;
      scope.body = attrs.body ? $sce.trustAsHtml(attrs.body) : 'Body Text Here.';
      scope.hasFooter = attrs.footer === 'has-buttons' ? 'has-buttons' : 'has-content';
      scope.footerContent = attrs.footer;
      scope.style = {width: '500px', height: '100px'};
      scope.template = attrs.dialogTemplate ? attrs.dialogTemplate : templatePath + defaultTemplate;

      if (attrs.width) {
        style.width = attrs.width;
      }
      if (attrs.height) {
        style.height = attrs.height;
      }

      style.height = '680px';
      style.width = '844px';

      scope.style = JSON.stringify(style);
      scope.show = true;
      return popup;
    }
  };
}]).factory('ConfirmDialog', ['$rootScope', 'ModalBox', function ($rootScope, ModalBox) {
  var $scope = $rootScope.$new();
  $scope.hideDialog = function () {
    $scope.show = false;
  };

  $scope.ok = function () {
    $scope.show = false;
  };

  $scope.cancel = function () {
    $scope.show = false;
  };

  return {
    showDialog: function (attrs) {
      ModalBox.showDialog($scope, attrs);
    }
  };
}]);
;
/**
 * User: Matt Black
 * User: Jeff Lu
 * Date: 7/18/2014
 * Time: 15:51
 *
 * Modified by riggs
 * 9/22/2014
 * Notes: set it up to handle array of events
 * Namespaced the events to prevent conflicts and for better memory management
 * added in optional 'suspend' param to toggle event listening
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcKeyPress', ['$document', function ($document) {
  'use strict';
  return {
    scope: {
      keyBindings: '=twcKeyPress',
      twcEventNamespace: '@twcEventNamespace',
      twcEventNamespaceSuspended: '=twcEventNamespaceSuspended'
    },

    link: function (scope, element, attrs) {
      var activeElement = element[0].tagName === 'INPUT' ? angular.element(element[0]) : $document;
      // commenting out keypress for now, keydown seems to have universal browser support
      // and keypress only captures character keys
      // var kp = 'keypress' + '.' + scope.twcEventNamespace;
      var kd = 'keydown' + (scope.twcEventNamespace ? '.' +  scope.twcEventNamespace : '');

      function mapEventToFunction(event) {
        angular.forEach(scope.keyBindings, function (keyObj) {
          if (event.which === parseInt(keyObj.keyCode)) {
            event.preventDefault();
            scope.$apply(keyObj.action);
          }
        });
      }

      activeElement.on(kd, function (evt) {
        if (!scope.twcEventNamespaceSuspended) {
          mapEventToFunction(evt);
        }
      });

      // garbage collection
      scope.$on('$destroy', function () {
        activeElement.off('.' + scope.twcEventNamespace);
      });
    }
  };
}]);
;
/**
 * Created with PhpStorm
 * User: ssherwood
 * Date: 7/7/14
 * Time: 8:33 AM
 *
 */

twc.shared.apps.factory('MetricsControl',['twcPco', 'twcUtil', 'customEvent', function (twcPco,  twcUtil, customEvent) {

  var func,$ = jQuery,
      metricsReady = customEvent.getEvent('utagReady');

  func = {
    resetPCO: function ($) {
      pcoPage = twcPco.get('page');
      pcoPage.setUpFV($);
      pcoPage.setUpPartner($, [null,twcPco.get('user')]);
    },
    resetMetrics: function () {
      s.prop39 =  '';
      s.eVar39 = twcPco.getNodeValue('user','partner');
      s.eVar60 = twcPco.getNodeValue('page','partner');

    }
  };

  return {
    pageView: function () {
      metricsReady.done(function () {
        func.resetPCO($);
        func.resetMetrics();
        s.t();
      });
    }
  };

}]);
;
/**
 * User: Jeff Lu
 * Date: 10/19/2014
 * Time: 13:58
 *
 * First cut of TwcMicrodata factory to auto inject microdata itemscope, itemtype and itemprops into the page based on provided schema
 * The goal & purpose of adding microdata into a page/content is to search engines better understand the page
 * content and to place rich snippets in search results.  And hopefully this will increase our content CTR
 *
 * TODO: Still need to fine tune different itemtype and itemprops based on different schema
 * Look into adding reviews, ratings, share counts, adding sentiment and etc.
 * Post reboot, we will want to wrap microdata around visible content that we want search engine to pay attention to rather than hidden
 * meta tags
 */

twc.shared.apps.factory('TwcMicrodata', ['twcConstant', '$q', '$http', function (twcConstant, $q, $http) {
  'use strict';

  /**
   * @deprecated
   * @returns {string}
   */
  var getDescription = function () {
    var meta = angular.element(document.querySelector('meta[name="description"]'));
    return meta && meta.length > 0 ? meta.attr('content') : 'Brought to you by The Weather Channel';
  };

  /**
   * @deprecated
   * @param md
   */
  var createMicrodata = function (md) {
    angular.forEach(md, function (val, key) {
      if (key === 'schema') {
        updateItemScope(val);
      } else {
        if (angular.isObject(val)) {
          angular.forEach(val, function (value, key) {
            if (key === 'schema') {
              updateItemScope(value);
            } else {
              addOrUpdateMeta(value, key);
            }
          });
        } else {
          addOrUpdateMeta(val, key);
        }
      }
    });
  };

  /**
   * @deprecated
   * @param val
   */
  var updateItemScope = function (val) {
    var html = angular.element(document.querySelector('html'));
    if (html) {
      html.attr('itemscope', '');
      html.attr('itemtype', val);
    }
  };

  /**
   * @deprecated
   * @param val
   * @param key
   */
  var addOrUpdateMeta = function (val, key) {
    if (val === null) {
      return;
    }
    var meta;
    var mask = {
      fbShareCount: {itemProp: 'interactionCount', content: 'FacebookLikes'},
      gplusShareCount: {itemProp: 'interactionCount', content: 'GooglePlus'}
    };
    var keyVal = {};
    if (key.indexOf('ShareCount') > 0 && mask[key]) {
      keyVal.key = mask[key].itemProp;
      keyVal.val = mask[key].content + ':' + val;
      meta = angular.element(document.querySelector('meta[content^=\'' + mask[key].content + '\']'));
    } else {
      keyVal.key = key;
      keyVal.val = val;
      meta = angular.element(document.querySelector('meta[itemprop="' + key + '"]'));
    }
    if (meta && meta.length === 0) {
      meta = angular.element('<meta itemprop="' + keyVal.key + '" content="' + keyVal.val + '" />');
      angular.element('head').append(meta);
    } else {
      meta.attr('itemprop', keyVal.key);
      meta.attr('content', keyVal.val);
    }
  };

  /**
   * @deprecated
   */
  var createSecurityPolicy = function () {
    var meta = angular.element('<meta http-equiv="Content-Security-Policy" content="script-src \'self\' https:\/\/plusone.google.com">');
    angular.element('head').append(meta);
  };

  /**
   * @deprecated
   * @param url
   * @returns {*[]}
   */
  var getShareCount = function (url) {
    var dffb = $q.defer();
    //  var dfgplus = $q.defer();
    //  var gplus = "https://plusone.google.com/_/+1/fastbutton?jsonp=JSON_CALLBACK&url="+encodeURIComponent(url),
    //      fb = "https://graph.facebook.com/fql?q=" + encodeURIComponent("SELECT url, normalized_url, share_count, like_count, comment_count, total_count,commentsbox_count, comments_fbid, click_count FROM link_stat WHERE url='" + url + "'");

    //    TODO: Need to explore in getting googleplus share count
    //    $http.jsonp(gplus).success(function(response){
    //      console.log(response);
    //      dfgplus.resolve(response);
    //    }).error(function(error) {
    //      dfgplus.resolve({});
    //    });

    //    FQL: no longer supported in FB Api v2.1 and above
    //    $http.get(fb).success(function(response){
    //      dffb.resolve(response && response.data ? response.data[0] : null);
    //    }, function(error) {
    //      dffb.resolve({});
    //    });
    dffb.resolve({});
    return [dffb.promise];
  };

  /**
   * @deprecated
   * @type {{injectMicrodata: twcMicrodata.injectMicrodata}}
   */
  var twcMicrodata = {
    // default to Organization if schema is not specified
    injectMicrodata: function (obj) {
      var md = obj ? obj : {};
      var url = md.url ? md.url : window.location.href;

      $q.all(getShareCount(url)).then(function (response) {
        var fbCount = response && response.length > 0 ? response[0].total_count : 'N/A';
        var twcMd = twcConstant.microdata;
        var schema = md.schema ? md.schema : 'Organization';
        var schemaUrl = twcMd.url;
        var commonProps = {
          schema: schemaUrl + schema,
          name: md.name ? md.name : 'The Weather Channel',
          description: md.description ? md.description : getDescription(),
          image: md.image ? md.image : 'http://s.w-x.co/TWC_logo_100x100.gif'
        };
        var creativeCommon = {
          fbShareCount: fbCount
        };
        var addressProps = {
          streetAddress: '300 Interstate North Pkwy',
          addressLocality: 'Atlanta, Georgia',
          postalCode: '30339'
        };
        var itemType = {
          Organization: {
            schema: schemaUrl + schema,
            common: commonProps
          },
          VideoObject: {
            common: commonProps,
            duration: md.duration ? md.duration : null,
            thumbnailUrl: md.thumbnailUrl ? md.thumbnailUrl : null,
            contentUrl: md.contentUrl ? md.contentUrl : null,
            embedUrl: md.embedUrl ? md.embedUrl : null,
            uploadDate: md.uploadDate ? md.uploadDate : null,
            expires: md.expires ? md.expires : null
          },
          ImageObject: {
            common: commonProps,
            author: md.author ? md.author : 'The Weather Channel',
            contentLocation: md.contentLocation ? md.contentLocation : '',
            publishDate: md.publishDate ? md.publishDate : ''
          },
          Article: {
            schema: schemaUrl + schema,
            common: commonProps
          }
        };
        createMicrodata(itemType[schema]);
      });
    }

  };

  return twcMicrodata;
}]);

/**
 * @deprecated
 */
twc.shared.apps.run(['twcConstant', 'TwcMicrodata', 'customEvent', function (twcConstant, TwcMicrodata, customEvent) {
  customEvent.getEvent('pcoReady').done(function () {
    var schema = twcConstant.microdata.schema;
    var meta = angular.element(document.querySelector('meta[property="og:image"]'));
    var canonical = angular.element(document.querySelector('link[rel="canonical"]'));
    var type = TWC.pco.getNodeValue('page', 'content');
    switch (type) {
      case 'article':
      case 'news':
        TwcMicrodata.injectMicrodata({
          schema: schema[type].name,
          image: meta ? meta.attr('content') : null
          //          name: mediaAsset.title,
          //          description: mediaAsset.description,
          //          author: asset.getProviderId(),
          //          publishDate: asset.getPublishDate()
        });
        break;
      case 'video':
        // TODO: Need to get more info on video and other, setting to Organization type for now
        TwcMicrodata.injectMicrodata({
          schema: schema[type].name,
          image: meta ? meta.attr('content') : null,
          thumbnailUrl: meta ? meta.attr('content') : null,
          embedUrl: canonical ? canonical.attr('href') : null
          //          name: mediaAsset.title,
          //          description: mediaAsset.description,
          //          author: asset.getProviderId(),
          //          publishDate: asset.getPublishDate()
        });
        break;
      case 'other':
        if (TWC.pco.getNodeValue('page', 'pathname') === 'ugc') {
          TwcMicrodata.injectMicrodata({
            schema: schema.image.name,
            image: meta ? meta.attr('content') : null
          });
        } else {
          TwcMicrodata.injectMicrodata();
        }
        break;
      default:
        TwcMicrodata.injectMicrodata();
        break;
    }
  });
}]);
;
/**
 * User: Jeff Lu
 * Date: 3/31/2015
 * Time: 13:34
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcUpsAlert', ['customEvent', function (customEvent) {
  'use strict';
  return {
    link: function (scope, element, attrs) {
      var type = attrs.twcUpsAlert;
      element.on('click', function () {
        customEvent.getEvent('twc-ups-alert').notify({data: {type: type}});
      });
      // garbage collection
      scope.$on('$destroy', function () {
        $el.off('click');
      });
    }
  };
}]);
;
/**
 * User: Ankit Parekh
 * Date: 6/19/2014
 * Time: 12:3
 */

twc.shared.apps.factory('linkerFactory', ['$rootScope', 'dsxclient', 'PcoPage', 'customEvent', '$interpolate','twcPco', 'twcUtil',
  function ($rootScope, dsxclient, PcoPage, customEvent, $interpolate, twcPco, twcUtil) {
  'use strict';

  var currentTimeISO, tzOffset, config, tempScope;

  /**
   * Make the CS Date time call to get the current time in ISO
   */
  var getDateTime = function () {
    dsxclient.execute(config).then(['dateTimeModel', function (dateTimeModel) {
      if (dateTimeModel) {
        // check if dateTimeModel exists and if not use the property directly from the response data. If all fails, use new Date ISO string
        currentTimeISO = (dateTimeModel && dateTimeModel.getDateTimeISO) ? dateTimeModel.getDateTimeISO() : (dateTimeModel.data && dateTimeModel.data.datetime ? dateTimeModel.data.datetime : new Date().toISOString());
        customEvent.getEvent('gotCurrentTime').resolve({date: currentTimeISO});
      }
      // if there is no response for the date time model, defaulting to the user's browser current time to determine the timezone for scheduling
      else {
        currentTimeISO = new Date().toISOString();
        customEvent.getEvent('gotCurrentTime').resolve({date: currentTimeISO});
      }

    }])['catch'](function () {
      customEvent.getEvent('gotCurrentTime').reject();
      console.log('error');
    });
  };

  /**
   * Returns the time to ISO format
   * @param dateTime
   * @param diff
   */
  var toISOTimeFormat = function (dateTime, diff) {
    var sign = '+';
    var minutes = '00';
    if (diff < 0) {
      sign = '-';
      diff = diff * -1;
    }
    var addZero = diff > 9 ? '' : '0';
    if (diff % 1 !== 0) {
      diff = parseInt(diff);
      minutes = '30';
    }

    return dateTime.replace(' ', 'T') + sign + addZero + diff + ':' + minutes;
  };

  var jq = window.jQuery;
  var init = function () {
    // Listen for all page promises to complete
    // waiting for pcopage and pcouser promises for dynamic location to be populated in rootscope
    jq.when.apply(jq, [].concat(twcPco.get('page').promises, twcPco.get('user').promises)).done(function () {
      // Valid Location Check
      var locId;
      tempScope = ('dynamiclocation' in $rootScope && $rootScope.dynamiclocation) ? $rootScope : {};
      customEvent.getEvent("linker_factory_tempScope").resolve(tempScope);
      if (PcoPage.getCurrentLocationModel() && !PcoPage.getCurrentLocationModel().data.error) {
        var loc = PcoPage.getCurrentLocationModel();
        var daylightAdjustment = loc.getDaylightSavingsActive() === 'Y' ? 1 : 0;
        // use the current location offset
        locId = loc.getFullLocId();
        tzOffset = loc.getGmtDiff() + daylightAdjustment;
      } else {
        // If No Location, Default to current location i.e. Eastern time Zone
        locId = '30339:4:US';
        // use the users browser timezone offset
        tzOffset = ((new Date().getTimezoneOffset() / 60) * -1);
      }

      config = [{$id: "dateTimeModel", recordType: "cs", recordName: "datetime", fullLocId: locId}],

      // make the DSX Call for cs/datetime and get the current time in ISO
      getDateTime();
    });
  };

  init();

  return {
    /**
     * Checks the start time and end time of the scheduled link and returns whether its valid or not based on current time
     * @param validBetween
     * @param overrideTzOffset
     */
    validateLinkSchedule: function (validBetween, overrideTzOffset) {
      // override the location timezone offset with the override supplied by the module
      if (overrideTzOffset) {
        tzOffset = overrideTzOffset;
      }

      // Link is valid if there is no start time
      if (!validBetween.value) {
        return true;
      }

      // Convert the start time and end time to ISO time format
      var startTimeISO = toISOTimeFormat(validBetween.value, tzOffset);
      var endTimeISO = toISOTimeFormat(validBetween.value2, tzOffset);

      var startTimeMilliseconds = twcUtil.fromISOToDate(startTimeISO).getTime();
      var endTimeMilliseconds = twcUtil.fromISOToDate(endTimeISO).getTime();
      var currentTimeMilliseconds = twcUtil.fromISOToDate(currentTimeISO).getTime();

      // Link is valid if there is no start time or end time or current time or if start time is same as end time
      if (!startTimeMilliseconds || !endTimeMilliseconds || !currentTimeMilliseconds || startTimeMilliseconds === endTimeMilliseconds) {
        return true;
      }
      // Check to see if the current time value is between start time and end time
      return startTimeMilliseconds < currentTimeMilliseconds && endTimeMilliseconds > currentTimeMilliseconds;
    },

    interpolateLinkUrl: function (linkUrl) {
      if (tempScope && linkUrl) {
        return $interpolate(linkUrl)(tempScope);
      } else {
        return linkUrl;
      }
    }

  };

}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 3/18/14
 * Time: 2:30 PM
 * Comments: Ad control for ad-related operations on the site.
 */

twc.shared.apps.factory('AdControl',['twcConfig','twcPco', 'PcoAd', 'twcUtil', 'customEvent', '$q', function (twcConfig, twcPco, PcoAd, twcUtil, customEvent, $q) {

  var refreshEvent = customEvent.getEvent('slotRefreshReady'), // Event fired in ad node of pco after DFPSlots have been updated
      loadEvent = customEvent.getEvent('dfpLoaded'), // Event fired by Tealium when Ad_Slot_Definition is complete
      slotRefreshEvent = customEvent.getEvent('slotRefreshReady'), // Event fired after all Tealium slots are rendered
      slotRefresh = false; // Used by UGC when opening a slot in the modal window
  window.googletag = window.googletag || {};
  googletag.cmd = googletag.cmd || [];

  slotNames2Slots = function (slotNames) {
    if (slotNames && slotNames.length) {
      var refreshSlots = PcoAd.getRefreshSlots(), slots = [];
      angular.forEach(slotNames, function (slotName) {
        if (slotName in refreshSlots) {
          slots.push(refreshSlots[slotName].slot);
        }
      });
      return slots;
    } else {
      return null;
    }
  };

  setTargeting = function (targetMap, targetObj) {
    angular.forEach(targetMap, function (val, key) {
      // Changing this to setTageting for pubads
      //targetObj.setTargeting(key, val);

      // Clear targeting and reset
      googletag.pubads().clearTargeting();
      googletag.pubads().setTargeting(key, val);

    });
  };

  refresh = function (targetMap, slots) {
    // If googletag is not there, bust out.
    if (!googletag || !('pubads' in googletag)) { return; }
    // Initialize to empty map to save multiple if loops
    var tMap = targetMap || {}, pubads = googletag.pubads();

    if (slots) {
      // double for loop. do it the classic way and not with callback.
      // angular.forEach(slots, function(slot) {
      //   angular.forEach(slots, function(slot) {
      //
      //   });
      // });
      for (var slotIdx = 0, slotLen = slots.length; slotIdx < slotLen; slotIdx++) {
        var cSlot = slots[slotIdx];
        if (cSlot) {
          clearElement(cSlot);
          setTargeting(tMap, cSlot);
        }
      }
    } else {
      setTargeting(tMap, pubads);
    }
    // NEW CODE for Header Bidding
    if (typeof index_headertag_lightspeed !== 'undefined') {
      var cb = (function (slots) {
        return function () {
          index_headertag_lightspeed.set_slot_targeting(slots);
          pubads.refresh(slots);
        };
      })(slots);
      index_headertag_lightspeed.add_session_end_hook(cb, true);
      index_headertag_lightspeed.refresh();
    } else {
      pubads.refresh(slots);
    }
  };
  // NEW CODE for Header Bidding;

  getTargetMapFromCustParams = function (cust_params) {
    var targetMap = {};
    try {
      var targets = window.decodeURIComponent(cust_params).split('&');
      angular.forEach(targets, function (target) {
        var parts = target.split('=');
        if (parts && parts.length > 1) {
          var key = parts[0], value = parts.splice(1);
          targetMap[key] = value.join('=');
        }
      });
    }
    catch (err) {
      // ignore the errors
    }
    return targetMap;
  };

  clearElement = function (slot) {
    var slotName;
    if (angular.isObject(slot)) {
      slotName = slot.getSlotId().getDomId();
    } else if (angular.isString(slot)) {
      slotName = slot;
    }
    if (slotName) {
      var $domEl = angular.element('#' + slotName);
      if ($domEl && $domEl.length > 0) {
        $domEl.empty();
      }
    }
  };

  return {
    /**
     * Refresh all slots on the page. This uses googletag.pubads().setTargeting and .refresh.
     *
     * @param targetMap - a map of all targets that has to be set. Since, this is a full refresh, we need not have
     * slot specific targets here. Structure: {key1 : value1, key2 : value2}
     */
    refreshAllSlots: function (targetMap) {
      // do refresh
      refreshEvent.done(function () {
        refresh(targetMap, null);
      });
    },

    /**
     * Under implementation. Ideally, targetMap is a map containing target information for each slot
     * something like {slot1 : {key1 : value1, key2 : value2}, slot2 : {key1 : value1}}.
     * Currently, targetMap is a map containing key, value pairs for the entire page like
     * {key1 : value1, key2 : value2}
     *
     * @param targetMap {object} - hash map of key,value targeting pairs
     * @param slotNames {array} [slotNames] - optional array of ad position names
     */
    refreshSlots: function (targetMap, slotNames) {
      // refresh specific slots
      refreshEvent.done(function () {
        var slots = [];
        slots = slotNames2Slots(slotNames);
        refresh(targetMap, slots);
      });
    },

    /**
     * Under alpha research. Steve will have to modify the data structure of ad positions that is spit out
     * on the page now. It will be done during companion ad addition.
     *
     * @param targetMap
     */
    refreshRetargetSlots: function (targetMap) {
      refreshEvent.done(function () {
        var refreshSlots = PcoAd.getRefreshSlots(),
          refreshableSlots = (refreshSlots ? twcUtil.filter(refreshSlots, function (slotObj) {
            return slotObj.slot && slotObj.refresh;
          }) : null),
          slots = (refreshableSlots ? twcUtil.map(refreshableSlots, function (refreshSlot) {
            return refreshSlot.slot;
          }) : null);

        refresh(targetMap, slots);
      });
    },

    /**
     * Refresh an array of DFP slot objects with targeting (per each slot) that
     * is updated with new location object.  pco ad.location is set to locObj,
     * which updates pco wx node and then updates ad.cust_params.  If null is
     * passed for the optional slots param, targeting is applied to the entire page.
     *
     * @param targetMap {object} - hash map of key,value pairs
     * @param slotNames {array} [slotNames] - optional array of ad positions
     * @param locObj {object} - full location object
     */
    refreshSlotsWithLoc: function (targetMap, slotNames, locObj) {

      refreshEvent.done(function () {
        if (angular.isObject(locObj)) {
          // Create new 'ad_cust_params_update' deferred event
          // (overwrite if it already exists) for this slot refresh.
          // ad.js will trigger this event after the ad.location
          // is set and cust_params have been updated.
          TWC.Events.ad_cust_params_changed =  jQuery.Deferred();

          TWC.Events.ad_cust_params_changed.done(function () {
            var cust_params = twcPco.getNodeValue('ad','cust_params'),
                keyValues, i, l, custMap = {}, slots = [];
            cust_params = decodeURIComponent(cust_params);
            keyValues = cust_params.split("&");
            for (i = 0,l = keyValues.length;i < l; i++) {
              var keyValue = keyValues[i].split("=");
              custMap[keyValue[0]] = keyValue[1];
            }
            angular.extend(custMap,targetMap);
            slots = slotNames2Slots(slotNames);
            refresh(custMap,slots);
          });

          twcPco.setNodeValue('ad','location',locObj);
        }
      });
    },

    createOrRefreshSlot: function (slotNames, targetMap, enableCorrelatorUpdate) {
      var deferred = $q.defer();
      TWC.Events.createOrRefreshSlot = TWC && TWC.Events && TWC.Events.getEvent('createOrRefreshSlot');
      slotRefreshEvent.done(function () {
        var gnv = twcPco.getNodeValue,
          ads_ctrld_clientside = gnv("ad","ads_ctrld_clientside");

        // To create or refresh slot, it has to be a ad that is controlled clientside
        if (ads_ctrld_clientside) {
          var cust_params = gnv("ad","cust_params"), i, l, slotName, p,
            adUnitAndZone = gnv("ad","adUnitAndZone"),
            DFPSlots      = twcPco.getNodeValue("ad","DFPSlots"),
            slots2Refresh = [], sizes, pos,
            processSlot   = function (slotName) {
              if (DFPSlots[slotName].slot) {
                return DFPSlots[slotName].slot;
              } else {
                var slot = googletag.defineSlot(adUnitAndZone, sizes, slotName);

                // When creating a new slot with googletag.display
                // The Slot does not have to be refreshed later
                slotRefresh = false;

                //googletag.enableSingleRequest();
                googletag.enableServices();
                slot.addService(googletag.pubads());
                slot.setTargeting("pos",pos);
                setTargeting(targetMap, slot);
                if (enableCorrelatorUpdate) {
                  googletag.pubads().updateCorrelator();
                }

                // NEW CODE for Header Bidder
                if (typeof index_headertag_lightspeed !== 'undefined') {
                  var cb = (function (slotName, slot) {
                    return function () {
                      index_headertag_lightspeed.set_slot_targeting([slot]);
                      googletag.display(slotName);
                    };
                  })(slotName, slot);
                  index_headertag_lightspeed.add_session_end_hook(cb, true);
                  index_headertag_lightspeed.refresh();
                } else {
                  googletag.display(slotName);
                }
                // NEW CODE for Header Bidder

                // store slot
                DFPSlots[slotName].slot = slot;
                return slot;
              }
            };

          targetMap = targetMap || {};
          angular.extend(targetMap, getTargetMapFromCustParams(cust_params));

          // if slotNames is an array of slots, process each one individually
          if (typeof slotNames === "object" && slotNames.length && slotNames.length > 0) {
            slots2Refresh = [];
            for (i = 0,l = slotNames.length; i < l; i++) {
              if (!ads_ctrld_clientside[slotNames[i]]) {
                continue;
              }
              slotName = slotNames[i];
              if (ads_ctrld_clientside[slotName]) {
                sizes = ads_ctrld_clientside[slotName].sizes;
                pos = ads_ctrld_clientside[slotName].pos;
                slots2Refresh.push(processSlot(slotName));
              }
            }
          } else {
            // process single slotName (i.e. string)
            slots2Refresh = [];
            if (ads_ctrld_clientside[slotNames]) {
              sizes = ads_ctrld_clientside[slotNames].sizes;
              pos = ads_ctrld_clientside[slotNames].pos;
              slots2Refresh.push(processSlot(slotNames));
            }
          }

          if (slotRefresh) {
            if (slots2Refresh.length === 1) {

              // If just a single slot refresh / retarget the slot
              refresh(targetMap, slots2Refresh);

            } else if (slots2Refresh.length > 1) {

              // If array of multiple slots retarget page for these slots
              for (i = 0, l = slots2Refresh.length; i < l; i++) {
                clearElement(slots2Refresh[i]);
              }

              // Clear targeting and reset
              googletag.pubads().clearTargeting();

              for (p in targetMap) {
                if (targetMap.hasOwnProperty(p)) {
                  googletag.pubads().set(p, targetMap[p]);
                }
              }

              googletag.pubads().refresh(slots2Refresh);
            }
          }
          slotRefresh = true; // Set to true so already created slots will refresh
          deferred.resolve();
          TWC.Events.createOrRefreshSlot.resolve();
        } else {
          deferred.reject();
          TWC.Events.createOrRefreshSlot.reject();
        }
      });

      return deferred.promise;
    },

    /**
     * Call this only once as multiple call to this method will cause duplicate events.
     *
     * @param slotName
     * @param callback
     */
    onSlotRender: function (slotName, callback) {
      loadEvent.done(function () {
        googletag.pubads().addEventListener('slotRenderEnded',function (e) {
          var domId = e.slot.getSlotId().getDomId();
          if (domId === slotName) {
            callback();
          }
        });
      });
    },

    /** ugcTealium is a call that accepts a ugc collection as a param and
     *  processes it through Tealium lookup tables to set adCategory,
     *  adFamily and adChannel in the metrics node of the pco.  It also
     *  updates the customparams in the ad node of the pco, so the ugc
     *  client side ad calls have the correct cat= and ch= .
     *
     *  utag.sender is an array of Tealium tags. The gpt tag has a uid
     *  of 11, so utag.sender[11] returns the gpt object.  The gpt object
     *  contains an extend array of Tealium extensions.  There are three
     *  extensions that need to be run after the utag['js_page.ugcLookup']
     *  variable is set to the new collection.
     *
     *  @param ugcCollection
     */
    ugcTealium: function (ugcCollection) {
      if (ugcCollection) {
        utag_data['js_page.ugcLookup'] = ugcCollection;
        utag.view(utag_data, null, ['114']);
      }
    },
    registerCompanion: function (adsObjectFromPco) {
      if (adsObjectFromPco && adsObjectFromPco.ad_video_companions) {

        //Get companion slot id and slot sizes from pco
        var companionName, companionSlots;
        for (var compName in adsObjectFromPco.ad_video_companions) {
          if (adsObjectFromPco.ad_video_companions.hasOwnProperty(compName)) {
            companionName = compName;
            //This is an array of arrays([width,height]) hence allows multi-slot
            companionSlots = adsObjectFromPco.ad_video_companions[compName].sizes;
            //We will always have only one companion which in turn can have multiple slizes (slots)
            break;
          }
        }

        //Register companion with gpt
        window.googletag = window.googletag || {};
        googletag.cmd.push(function () {
          var adUnitAndZone = TWC.pco.getNodeValue("ad", "adUnitAndZone");
          //googletag.defineSlot(adUnitAndZone, [300, 250], "WX_VideoCompanion").addService(googletag.companionAds());
          googletag.defineSlot(adUnitAndZone, companionSlots, companionName).addService(googletag.companionAds());
          googletag.companionAds().setRefreshUnfilledSlots(true);
          googletag.pubads().enableVideoAds();
          googletag.enableServices();
          //googletag.display("WX_VideoCompanion");
          googletag.display(companionName);
        });
      }
    },

    /**
     * utility function to request a new bid from amazon and update
     * cust_params with amznslots data
     */
    refreshAmznSlots: function () {
      var amznUpdateEventName = "amzn_refresh_" + (new Date().getTime()),
          amznUpdateEvent = customEvent.getEvent(amznUpdateEventName);
      customEvent.getEvent('dfpLoaded').done(function () {
        if (window.amznads) {
          var $ = angular.element, cust_params,
            cust_params_map = getTargetMapFromCustParams(TWC.pco.get("ad").attributes.cust_params);
          delete cust_params_map.amznslots, delete cust_params_map.amzn_vid;
          amznads.asyncParams = {
            id: '1004',
            callbackFn: function () {
              var targeting = amznads.getTargeting();
              if (targeting) {
                cust_params_map.amznslots = $.isArray(targeting.amznslots) && targeting.amznslots.join(',') || null;
                if (targeting.amzn_vid && $.isArray(targeting.amzn_vid)) {
                  cust_params_map.amzn_vid = targeting.amzn_vid.join(',') || null;
                }
              }
              cust_params = $.map(cust_params_map, function (val, p) {
                return p + '=' + val;
              });
              cust_params = cust_params.join("&");
              twcPco.setNodeValue('ad', 'cust_params', cust_params);
              amznUpdateEvent.resolve(amznUpdateEventName);
              return cust_params_map;
            },
            timeout: 2000
          };
          $.ajax({
            url: '//c.amazon-adsystem.com/aax2/amzn_ads.js',
            dataType: 'script',
            cache: false,
            timeout: 2000,
            error: function () {
              amznUpdateEvent.resolve(amznUpdateEventName);
            }
          });
        }
      });
      return amznUpdateEventName;
    },

    /**
     * utility function to request a new bid from criteo and update
     * cust_params with criteo data
     */
    refreshCriteoData: function () {
      var criteoUpdateEventName = "criteo_refresh" + (new Date().getTime()),
          criteoUpdateEvent = customEvent.getEvent(criteoUpdateEventName),
        $ = angular.element,crtg_nid = TWC.Configs.criteo.nid,
        crtg_cookiename = TWC.Configs.criteo.cookiename,
        crtg_varname = TWC.Configs.criteo.varname;
      $.ajax({
        url: "//rtax.criteo.com/delivery/rta/rta.js?netId=" + crtg_nid +
        "&cookiename=" + crtg_cookiename +
        "&varName=" + crtg_varname,
        dataType: 'script',
        cache: false,
        timeout: 2000,
        error: function () {
          criteoUpdateEvent.resolve();
        },
        success: function () {
          customEvent.getEvent('dfpLoaded').done(function () {
            var p, cust_params, criteo_array = crtg_varname ? crtg_content.split(';') : [],
                criteo_string = $.isArray(criteo_array) ? criteo_array.join("&") : "";
            cust_params_map = getTargetMapFromCustParams(PcoAd.getCustom_Params());

            for (p in cust_params_map) {
              if (p.match(/twc[a-z]*[0-9]*/)) {
                delete cust_params_map[p];
              }
            }
            cust_params = $.map(cust_params_map, function (val, p) {
              return p + '=' + val;
            });
            cust_params = cust_params.join("&") + "&" + criteo_string;
            twcPco.setNodeValue('ad','cust_params', cust_params);
            criteoUpdateEvent.resolve();
          });
        }
      });
      return criteoUpdateEventName;
    }

  };
}]);
;
/**
 * Created with PhpStorm
 * User: ssherwood
 * Date: 7/18/14
 * Time: 9:33 AM
 *
 */

twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.directive('removePanePadding', function () {
  return {
    scope: true,
    replace: false,
    transclude: false,
    link: function ($scope, $element, $attrs) {
      $element.closest('.panel-pane').removeClass('module-padding');
    }
  };
});
;
/**
 * User: Hussein Qudsi
 * Date: 3/14/2016
 * Time: 17:11
 */
/* global twc */
/*jshint -W065 */
twc.shared.apps.factory('gmSendNotification', ['$window', function ($window) {
  'use strict';

  /**
   * 1. vars
   * notificationFallBack is a example of push notification content
   * Tile = the title of the push
   * Body = body txt
   * Icon = thumbnail image
   * Tag = is the ID of a alert
   * URL = is the url to open the page, Note: 'none' is if you don't want to open to any URL
   * */
  var notificationFallBack = {
      title: 'The Weather Channel', // The title of the
      body: 'TWC alert notification click here for details',
      icon: '//s.w-x.co/TWC_logo_100x100.gif',
      tag: 'TWC-NotificationFallBack', // ID for tracking
      url: '//weather.com'
    },
    isSupported = !!($window.Notification && Notification.requestPermission),
    user = TWC && TWC.pco && TWC.pco.get('user'), recentLocationsArray;

  /** Sending notification confirmation */
  var SendNotification = {
    /** Checks browser's serviceWorker support */
    _isSupported: function () {
      return (navigator && navigator.serviceWorker && navigator.serviceWorker.ready);
    },

    /**
     * send method
     * Sends a push notification
     * @param notificationContent = notification content option
     * ex: {title: 'title', body: 'body text', icon: 'thumbnail', tag: 'tag-1', url: 'url.com'}
     * */
    send: function (notificationContent) {
      if (SendNotification._isSupported()) {
        if (isSupported) {
          Notification.requestPermission(function (result) {
            if (result === 'granted') {
              navigator.serviceWorker.ready.then(function (registration) {
                // Configuring confirmation notification title & alert content
                return registration && registration.showNotification &&
                  registration.showNotification(notificationContent.title || notificationFallBack.title, {
                    body: notificationContent.body || notificationFallBack.body,
                    tag: notificationContent.tag || notificationFallBack.tag,
                    icon: notificationContent.icon || notificationFallBack.icon,
                    data: {
                      url: notificationContent.url || notificationFallBack.url
                    }
                  });
              }).catch(function (error) {
                return error;
              });
            }
          });
        }
        else {
          return null;
        }
      }
      else {
        return null;
      }
    },

    /**
     * Generate loc obj
     * Factory function, generates loc obj
     * @param name = click event
     * @param locId = click event
     * @param loc = click event
     * @param locType = click event
     * @param zipCd = click event
     * @param alertType = click event
     * */
    generateLocationObj: function (name, locId, loc, locType, zipCd, alertType) {
      return {
        name: name,
        subscribeLocation: false,
        locId: locId,
        locType: locType,
        zipCd: zipCd,
        loc: loc,
        alertType: alertType
      };
    },

    /** Checking if user has already subscribed */
    locations: function (type) {
      // Generating the recentLocationsArray array
      var recentLocations = user && user.attributes && user.attributes.recentSearchLocations;
      if (Array.isArray(recentLocations)) {
        recentLocationsArray = recentLocations.map(function (loc) {
          return loc && loc.prsntNm && SendNotification.generateLocationObj(loc.prsntNm, loc.locId, loc.loc, loc.locType, loc.zipCd, type);
        });
      }
      return recentLocationsArray || [];
    }
  };// End of SendNotification

  // Exposing gm_send_notification method
  return {
    send: SendNotification.send,
    locations: SendNotification.locations
  };

}]);;
/**
 * Created by josh.tepei on 3/3/16.
 */

/**
 * gmAnonymous.createAccount
 * gmAnonymous.retrieveAccount
 * gmAnonymous.destroySession
 * gmAnonymous.deleteAccount
 */
twc.shared.apps
  .factory('gmAnonymous', ['$http', 'gmAnonymousDsx',
  function ($http, gmAnonymousDsx) {
    'use strict';

    var exports = {};

    exports.postToDsx = postToDsx;
    exports.setLocale = setLocale;
    exports.setEndpoint = setEndpoint;
    exports.getEndpoints = getEndpoints;
    exports.removeEndpoint = removeEndpoint;
    exports.subscribeBreakingNews = subscribeBreakingNews;
    exports.deleteService = deleteService;
    exports.createLocation = createLocation;
    exports.deleteLocation = deleteLocation;
    exports.subscribeSevereAlerts = subscribeSevereAlerts;
    exports.subscribeGlobal8 = subscribeGlobal8;
    exports.getAccountInfo = getAccountInfo;

    return exports;

    //posts an obj to a dsx path
    function postToDsx (path, data) {
      return gmAnonymousDsx.post(path, data);
    }

    function getAccountInfo () {
      return gmAnonymousDsx.get('p');
    }

    function setLocale (locale) {
      //example - {"locale" : "de-de"}
      return gmAnonymousDsx.put('p/preferences', locale);
    }

    function setEndpoint (deviceId, chan) {
      //example - {"addr":"", "chan":"gcm"}
      return gmAnonymousDsx.post('p/endpoints', {"addr": deviceId, "chan": chan});
    }

    function getEndpoints () {
      return gmAnonymousDsx.get('p/endpoints');
    }

    function removeEndpoint (endpoint) {
      return gmAnonymousDsx.destroy('p/endpoints/' + endpoint);
    }

    function subscribeBreakingNews (endpoint) {
      //example - {"status": "enabled","product": "breakingnews","endpoint": "yzw9vhFQK8ARk"}
      return gmAnonymousDsx.post('p/services/cms-push', {"status": "enabled", "product": "breakingnews", "endpoint": endpoint});
    }

    function deleteService (endpoint) {
      return gmAnonymousDsx.destroy('p/services/' + endpoint);
    }

    function createLocation (locId) {
      //example - {"loc": "30519:4:US"}
      return gmAnonymousDsx.post('p/locations', {"loc": locId});
    }

    function deleteLocation (location) {
      //example - "xp7tJgRZWnXSy"
      return gmAnonymousDsx.destroy('p/locations/' + location);
    }

    function subscribeSevereAlerts (endpoint, location) {
      //example - {"endpoint" : "yzw9vhFQK8ARk","location" : "xp7tJgRZWnXSy","threshold": "M"}
      return gmAnonymousDsx.post('p/services/severe', {"status": "enabled", "endpoint": endpoint, "location": location, "threshold": "M"});
    }

    function subscribeGlobal8 (product, endpoint, location) {
      //example - {"status": "enabled", "product": "NSF", "endpoint": "yzw9vhFQK8ARk', "location": "xp7tJgRZWnXSy"}
      return gmAnonymousDsx.post('p/services/global8', {"status": "enabled", "product": product, "endpoint": endpoint, "location": location});
    }

  }]);;
/**
 * This factory provides a way to create anonymous profiles
 * Created by josh.tepei on 2/27/16.
 */

twc.shared.apps
  .factory('gmAnonymousDsx', ['$http', '$q',
  function ($http, $q) {
    'use strict';

    var exports = {};
    exports.BASE_URL = TWC.Configs.dsx.host || 'dsx.weather.com';
    exports.API_KEY = '112bf7d6-fb5d-11e5-86aa-5e5517507c66';

    exports.get = function (path) {
      if (document.cookie.indexOf('dsx') === -1) {
        return request("POST", 'dsx/session', exports.API_KEY).then(function() {
          return request("POST", '/u', {"provider": "anon", "token": "", "id": TWC.pco.get('user').get('rmid')}).then(function () {
            return request("GET", path);
          });
        });
      }
      return request("GET", path);
    };

    exports.post = function (path, body) {
      return request("POST", path, body);
    };

    exports.put = function (path, body) {
      return request("PUT", path, body);
    };

    exports.destroy = function (path) { // naming this "delete" breaks IE8
      return request("DELETE", path);
    };

    var request = function (method, path, data) {
      var deferred = $q.defer();
      var init = {
        method: method,
        mode: 'cors',
        url: exports.BASE_URL + path,
        withCredentials: true
      };

      if (method === "POST" || method === "PUT") {
        //init.redirect = 'follow';
        init.data = data;
        //init.cache = 'default';
      }
      $http(init)
        .then(function(response) {
          deferred.resolve(response);
        })
        .catch(function(error) {
          console.log('Problem with fetch operation: ' + error.message);
        });

      return deferred.promise;
    };

    return exports;

  }]);;
/**
 * Created with JetBrains PhpStorm.
 * User: ssherwood
 * Date: 12/19/13
 * Time: 2:19 PM
 * To change this template use File | Settings | File Templates.
 *
 */

twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.directive('trackStr',['customEvent', 'twcPco', 'ActionTracker', function (customEvent, twcPco, action) {
  'use strict';
  return {
    scope: false,
    replace: false,
    transclude:false,
    link: function (scope, element, attrs) {
      element.click(function (e) {
        if (attrs.trackOnce && attrs.trackOnce === 'true') {
          angular.element(this).unbind(e);
        }
        if (attrs.trackFlag && attrs.trackFlag !== 'true') {
          return;
        }
        var pagename = (twcPco.get('metrics') && twcPco.get('metrics').attributes.pagename);
        var moduleId = (scope.getInstance && scope.getInstance().module_id) || attrs.moduleId;
        action.track(pagename, moduleId, attrs);
      });
    }
  };
}]).factory('trackEvent',['customEvent', 'twcPco', 'ActionTracker', function (customEvent,twcPco, action) {
  // This factory is being deprecated, use customEvent.getEvent('track-string-on-enter-event') instead
  return {
    fire: function (trackStr) {
      customEvent.ifReady(['utagReady']).done(function () {
        var pagename = (twcPco.get('metrics') && twcPco.get('metrics').attributes.pagename);
        var moduleId = (scope.getInstance && scope.getInstance().module_id || '').replace(/ /g, '-');
        var attrs = {trackStr: trackStr};
        action.track(pagename, moduleId, attrs);
      });
    }
  };
}])
.run(['customEvent', 'twcPco', 'ActionTracker', function (customEvent, twcPco, action) {
  // TODO: will need to implement trackType to account for different action types as needed (download, exit, pageview, & etc.)
  customEvent.ifReady(['utagReady']).then(function () {
    customEvent.getEvent('track-string-event').progress(function (e) {
      var pagename = ((twcPco.get('metrics') && twcPco.get('metrics').attributes.pagename) || '').replace(/ /g, '-');
      // The correct way is to pass the settings obj that will have the module_id for the current module
      // The e.scope will be deprecated soon
      var moduleId =  (e.module_id) ||
                      (e.settings && e.settings.module_id) ||
                      (e.scope && e.scope.getInstance && e.scope.getInstance().module_id),
          trackStr = e.attrs && e.attrs.trackStr || e.trackStr || '';
      var attrs = angular.extend({}, e.attrs || {}, {trackStr: trackStr});
      action.track(pagename, moduleId, attrs);
    });
  });
}]);
;
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.factory('ActionTracker', ['customEvent', function (customEvent) {
  var serviceObj = {
    track: function (pagename, moduleId, attrs) {
      var trackString = [pagename,moduleId,attrs.trackStr].join('_');

      if (attrs.trackStr) {
        customEvent.ifReady(['utagReady']).done(function (e) {
          // set trackSocialVars

          // track prop35 at a minimum, but add any additonal linkTrackVars
          attrs.linkTrackVars = (attrs.linkTrackVars && (attrs.linkTrackVars + ',prop35,prop44,eVar44,eVar65,eVar70')) ||
                                 'prop35,prop44,eVar44,eVar65,eVar70';

          for (var p in attrs) {
            if (p.match(/event|eVar|prop|linkTrackVars|campaign|linkTrackEvents/)) {
              s[p] = attrs[p];
            }
          }

          if (attrs.socialTrackAction) {
            // overwrite track string with the actual trackstring value.
            trackString = attrs.trackStr;
          }

          s.prop35 = trackString;

          /**The Tealium extension to turn off page views for video pages somehow disables utag.link, so replacing
           * it with straight s object code
           */

          //          utag.link({link_name: trackString, linkTrackVars: attrs.linkTrackVars ? (attrs.linkTrackVars + ",prop35") : "prop35"});

          s.tl(document, 'o', trackString);
          s.prop35 = '';

          // reset trackSocialVars

          for (p in attrs) {
            s[p] = '';
          }
        });
      }
    }
  };

  return serviceObj;
}]);
function sc_trackAction(obj,actionId,account) {try {
  var s = account != null ? s_gi(account) : s_gi(s_account);var sc_actionId = actionId;s.prop35 = sc_actionId;s.linkTrackVars = 'prop35';s.linkTrackEvents = 'None';s.tl(obj,'o',sc_actionId);
}catch (e) {return;}}
;
/**
 * User: Vishal Shrivastava
 * Date: 8/04/2015
 * Time: 11:46
 */

twc.shared.apps.controller('glomoBaseSearchController',['$scope', '$injector', '$q', 'customEvent', 'dsxclient', 'twcConfig', 'twcUtil', 'pcoUser', '$filter', 'twcConstant',
  function($scope, $injector, $q, customEvent, dsxclient, twcConfig, twcUtil, pcoUser, $filter, twcConstant) {
  'use strict';
  var logger = $scope.$root.$log.getInstance('glomoBaseSearchController');
  var LocModelClass = $injector.has('WxdLocModelClass') && $injector.get('WxdLocModelClass');
  var XwebModelClass = $injector.has('XwebWebLocModelClass') && $injector.get('XwebWebLocModelClass');
  var pfTranslateFilter = $filter('pfTranslate');

  /**
   * private method for updating a location
   * item: the location being operated on
   * type: recent search or saved location
   * add: boolean true for add, false for remove
   * @param item
   * @param type
   * @param add
   */
  var updateLocation = function(item, type, add) {
    if(!LocModelClass) { return; }
    var loc = new LocModelClass({
      'id':       item.getId() || '',
      'cntryCd':  item.getCountryCode(),
      'locId':    item.getLocId(),
      'locType':  item.getLocType(),
      'cityNm':   twcUtil.capitalize(item.getCity(), true, true),
      'bigCity':  item.isBigCity(),
      'stCd':     item.getStateCode(),
      'stNm':     item.getState(),
      'prsntNm':  item.getFormattedName(),
      '_country': item.getCountryName(),
      'nickname': item.getNickname()||'',
      'zipCd'   : item.getZipCode() ||'',
      'pos':      item.getPosition() || '',
      recentSearch: type === 'recentSearch' ? true : false
    }, 'WxdLocModelClass');

    if(type === 'recentSearch') {
      if(add) {
        pcoUser.addRecentSearchLocation(loc);
      } else {
        pcoUser.removeRecentSearchLocation(loc);
      }
    } else if(type === 'saveLocation') {
      if(add) {
        pcoUser.addSavedLocation(loc);
      } else {
        pcoUser.removeSavedLocation(loc);
      }
    } else {
      pcoUser.updateLocation(loc);
    }
  };

  var createModel = function(locModel) {
    if (locModel.getCity &&
      locModel.getStateCode &&
      locModel.getCountry &&
      locModel.getCountryCode &&
      locModel.getLocType) {

      return new XwebModelClass({
        'id' :      locModel.getId() || '',
        'name' :    locModel.getCity() + ', ' + locModel.getStateCode() + ', ' +  locModel.getCountry(),
        'key':      locModel.getFullLocId(),
        'locId':    locModel.getLocId(),
        'locType':  locModel.getLocType(),
        'cntryCd':  locModel.getCountryCode(),
        '_country': locModel.getCountry(),
        'stCd':     locModel.getStateCode(),
        'stNm':     locModel.getState() || '',
        'cityNm':   locModel.getCity() || '',
        'bigCity':  locModel.getBigCity && locModel.getBigCity() || false,
        'nickname': locModel.getNickname && locModel.getNickname() || '',
        'tag':      locModel.getTag && locModel.getTag() || '',
        'address':  locModel.getAddress && locModel.getAddress() || '',
        'pos':      locModel.getPosition() || '',

        'recentSearch': true
      }, 'XwebWebLocModelClass');
    } else {
      return null;
    }
  };

  var notify = function(type) {
    if(params && params.notifier) {
      customEvent.getEvent(params.notifier).notify(type);
    }
  };
  // Listen to add saved location and recent search events
  customEvent.getEvent('pcoReady').then(function(e) {
    $scope.$evalAsync(function() {
      params.recentSearches = null;
      params.savedLocations = null;
    });
  });
  customEvent.getEvent('locations_changed').progress(function(e) {
    if(e.key === 'savedLocations') {
      $scope.$evalAsync(function() {
        params.savedLocations = null;
      });
      notify('saved');
    } else if(e.key === 'recentSearchLocations') {
      $scope.$evalAsync(function() {
        params.recentSearches = null;
      });
      notify('recent');
    }
  });
  var localeToMinCharOverride = {
        "ar_AE" : "2",
        "bn_BD" : "2",
        "en_GB" : "2",
        "fa_IR" : "2",
        "hi_IN" : "2",
        "iw_IL" : "2",
        "ja_JP" : "1",
        "ko_KR" : "1",
        "th_TH" : "1",
        "uk_UA" : "2",
        "ur_PK" : "2",
        "zh_CN" : "1",
        "zh_TW" : "1",
        "zh_HK" : "1"
      };
  $scope.getMinChar = function(locale) {
    return localeToMinCharOverride[locale] || "3";
  };

  $scope.getBoostCountry = function(locale) {
    return twcConstant.localeToCountry[locale] || "us";
  };

  $scope.config = [{}];
  var searchLocale = (TWC && TWC.Titan && TWC.Titan.locale) || (TWC && TWC.Configs && TWC.Configs.dsx && TWC.Configs.dsx.locale) || "en_US";
  $scope.params = {
    minChar: $scope.getMinChar(searchLocale) ,
    resultLimit: 10,
    dsx: twcConfig.dsxclient,
    locTypes: '',
    xwebRecords: twcConfig.dsxclient.xweb.records,
    wxdRecords: twcConfig.dsxclient.wxd.records,
    noResult: pfTranslateFilter('No results found.', {context: 'glomo_base_search'}),
    settings: {},
    moduleId: '',
    resultType: '',
    recentSearches: null,
    savedLocations: null,
    locArr: [],
    suppressRecentSearches: false,
    notifier: null,
    isIE8: angular.element('html').hasClass('lt-ie9'),
    search_locale : searchLocale
  };
  var params = $scope.params;

  // Initialisation
  $scope.term = '';

  $scope.getXwebLocFromLoc = function(loc) {
    return createModel(loc);
  };

  $scope.showRecentSearches = function() {
    return $scope.params.suppressRecentSearches === true ? 'Suppressed' : 'Recent';
  };
  $scope.createLocArray = function(locTypes) {
    angular.forEach(locTypes, function (k, v) {
      params.locArr.push(k);
    });
    // Order is important here, must be in sequential order
    params.locArr.sort(function(a, b) { return a-b; });
    angular.forEach(params.locArr, function(loc) {
      params.locTypes += loc + '/';
    });
  };
  $scope.noResultError = function() {
    params.resultType = 'NoResult';
    $scope.results = [{result: params.noResult}];
    // Notify search-in-progress complete event, no results
    customEvent.getEvent('search-with-noresults').resolve({
      item: {
        result: params.noResult,
        autoSelect: true
      }
    });
  };
  $scope.goSelectItem = function(item) {
    // To be overridden by extended classes
    logger.debug('This function needs to be overridden.');
  };
  $scope.getRecentSearches = function () {
    if (!params.recentSearches) {
      var recentSearchLocs = pcoUser.getRecentSearchLocations();
      if(recentSearchLocs) {
        params.recentSearches = [];
        angular.forEach(recentSearchLocs, function (recentSearchLoc) {
          var model = createModel(recentSearchLoc);
          if(!!model) {
            params.recentSearches.push(model);
          }
        });
      }
    }
    return params.recentSearches;
  };
  $scope.getSavedLocations = function () {
    if (!params.savedLocations) {
      var savedLocs = pcoUser.getSavedLocations();
      if(savedLocs) {
        params.savedLocations = [];
        angular.forEach(savedLocs, function (savedLoc) {
          var model = createModel(savedLoc);
          if(!!model) {
            // ensure recentSearch flag is set to false
            model.data.recentSearch = false;
            params.savedLocations.push(model);
          }
        });
      }
    }
    return params.savedLocations;
  };
  $scope.saveRecentSearch = function(item) {
    params.recentSearches = null;
    updateLocation(item, 'recentSearch', true);
  };
  $scope.saveSavedLocation = function(item) {
//    p.savedLocations = null;
    updateLocation(item, 'saveLocation', true);
  };
  $scope.updateSavedLocation = function(item) {
//    p.savedLocations = null;
    updateLocation(item, 'updateLocation', true);
  };
  $scope.removeSavedLocation = function(item) {
//    p.savedLocations = null;
    updateLocation(item, 'saveLocation', false);
  };
  $scope.removeRecentSearch = function(item) {
//    p.savedLocations = null;
    updateLocation(item, 'recentSearch', false);
  };

  $scope.ensureUrlSlash = function(url) {
    if(!url.match(/^\//)) { url = '/' + url; }
    return url.match(/\/$/) ? url : url += '/';
  };

  $scope.validatePageUrl = function(url) {
    var page = twcConstant.pageUrl[params.moduleId]['page'];
    url = url ? url : '/weather/today/l/';
    if(page === 'dynamic') {
      twcConstant.pageUrl[params.moduleId]['page'] = $scope.ensureUrlSlash(url);
    }
  };

  $scope.landingPage = function(key, item) {
    $scope.addToRecentSearch.apply($scope, [item, 'deferLandingPage']);
  };

  $scope.deferLandingPage = function(key) {
    var theKey = typeof key === 'object' ? key.getKey() : key;
    location.href = twcConstant.pageUrl[params.moduleId]['page'] + theKey;
  };

  $scope.addToRecentSearch = function(item, callback) {
    // Check to see if location is in recent searches or saved locations
    var key = item.getKey && item.getKey() || item.getFullLocId && item.getFullLocId();
    if(item && !!item.data && !$filter('twcFilter').getByProperty('key', key, $scope.getRecentSearches()) && !$filter('twcFilter').getByProperty('key', key, $scope.getSavedLocations())) {
      var rs = $scope.getRecentSearches();
      customEvent.getEvent('locations_changed').progress(function(e) {
        // Ensure recent search got saved b4 redirecting
        if(e.locations.length === 10 || e.locations.length > rs.length) {
          $scope[callback](item);
        }
      });
      $scope.saveRecentSearch(item);
    } else {
      $scope[callback](item);
    }
  };

  $scope.getLocationByLocId = function(locId) {
    var df = $q.defer();
    $scope.config = [{
      recordType : "wxd",
      recordName : params.wxdRecords.loc,
      fullLocId: locId,
      locale: params.search_locale
    }];
    try {
      dsxclient.execute($scope.config).then(function(response) {
        df.resolve(response);
      });
    } catch(e) {
      logger.error(e.message);
      df.reject(e.message);
    }
    return df.promise;
  };

  $scope.tracking = function (from, track) {
    if(from && from.length > 0) {
      customEvent.getEvent('from-string-event').notify({
        settings: params.settings,
        fromStr: from
      });
    }
    if(track && track.length > 0) {
      customEvent.getEvent('track-string-event').notify({
        settings: params.settings,
        trackStr: track,
        linkTrackEvents: 'event1',
        events: 'event1'
      });
    }
  };

  $scope.recentSearches = function() {
    return $scope.getRecentSearches();
  };

  /**
   * resultType: Returns the current result type indicator (recent searches, search results or no results)
   * @returns {*}
   */
  $scope.resultType = function () {
    return params.resultType;
  };

  /**
   * getPresName: Calls getFormattedName() for properly formatted name
   * @param index
   * @returns {*}
   */
  $scope.getPresName = function (index) {
    var item = $scope.results[index];
    if (params.search_locale === "en_US" || (TWC && TWC.Titan && TWC.Titan.locale))  {// Use existing logic for US and Titan pages
      return item && !!item.getFormattedName ? item.getFormattedName() : '';
    } else {
      return item && !!item.getFormattedNameIntl ? item.getFormattedNameIntl() : '';
    }
  };

  /**
   * hasResults: Returns a boolean indicating if there are any search results
   * @returns {boolean}
   */
  $scope.hasResults = function () {
    if (!$scope.term) {
      $scope.results = $scope.recentSearches();
      params.resultType = $scope.showRecentSearches(); //'Recent';
    }
    return $scope.results && $scope.results.length > 0 ? true : false;
  };

  /**
   * selectItem: Sets input field with the properly formatted name of the selected item
   * Added custom event and debounce for 300 ms for fast typist before dsx comes back
   * @param item
   * @param enter
   */
  $scope.selectItem = function (item, enter) {
    var term = $scope.term;
    if (term.length >= params.minChar || term.length === 0) {
      if(enter === true && !twcUtil.isNumeric(term)) {
        customEvent.ifReady(['search-in-progress']).then(function (e) {
          customEvent.removeEvent('search-in-progress');
          $scope.goSelectItem(e.item);
        });
      } else {
        $scope.goSelectItem(item);
      }
    } else if(term.length <= 2) {
      // length == 2 for specialty
      $scope.goSelectItem(item);
    } else {
      customEvent.ifReady(['search-with-noresults']).then(function(e) {
        customEvent.removeEvent('search-with-noresults');
        $scope.goSelectItem(e.item);
      });
    }
  };

  /**
   * search: Makes a dsx call for searches as needed
   * @type {Function} This search function is being passed into debounce()
   * @param {String} term is the string that will be searched on
   */
  $scope.search = function (term) {
    params.resultType = 'Computing';
    var boostCountryCd = $scope.getBoostCountry(params.search_locale);
    $scope.results = [{result: pfTranslateFilter('Searching...', {context: 'glomo_base_search'})}];
    if (term && term.length >= params.minChar) {
      var config = $scope.config[0];
      config.locTypes = params.locTypes;
      config.country = {code: boostCountryCd, boost: true};
      config.term = term;
      config.locale = params.search_locale;

      try {
        dsxclient.execute($scope.config, {pg: '0,' + params.resultLimit}).then(function(response) {
          params.resultType = 'Search';
          var res = response.getModel({
            recordType : "xweb",
            recordName : params.xwebRecords.webLoc,
            locTypes: params.locTypes,
            term: term,
            locale: params.search_locale,
            country: {code: boostCountryCd, boost: true}
          });

          if(res && res.length > 0) {
            $scope.results = res.length > 10 ? res.splice(0, 10) : res;
          }
          else {
            $scope.noResultError();
          }
        });
      } catch(e) {
        $scope.noResultError();
        logger.error(e.message);
      }
    } else {
      params.resultType = $scope.showRecentSearches(); //'Recent';
      if (term.length !== 0 && $scope.results.length > 0) {
        params.resultType = 'NoResult';
        $scope.$evalAsync(function() {
          $scope.results = twcUtil.isNumeric(term) && term.length === 5 ? [] : [{result: params.noResult}];
        });
      } else if (term.length === 0) {
        $scope.results = $scope.getRecentSearches();
      }
    }
  }.debounce(200);

}]);
;
/**
 * User: Jeff Lu
 * Date: 12/10/2013
 * Time: 9:17
 */
/* global twc */
/*jshint -W065 */

/**
 * twcTypeahead Directive:  Serves as a generic reusable auto-complete search component
 * @(@attr) = Binds a local scope variable to a string value of the DOM attribute
 * =(=attr) = Bi-diretional binding betwwen local scope property and the parent property
 * &(&attr) = This enable the ability to execute a function in the context of the parent scope. To call parent method with an argument,
 * pass in an object with the key as the name of the argument and the value is the vaule being passed
 *
 * This directive handles key events(UP, DOWN, ESC, CR & TAB) as well as mouse events(mouseover, mouseleave & click)
 * And also touch events
 *
 * Since users can select a typeahead result by mouse click, up/down key strokes or simply hitting enter key,
 * we need a way to identify if a selection is from mouse click or key events.  Especially when user simply clicks enter
 * while dsx call is still in progress, we need the help of customer event search-in-progress to ensure proper selection
 *
 * scope variables:
 * search:  Binds to the search expression of the providing controller
 * term:    Binds the search term between the providing controller and twcTypeahead directive
 * select:  Binds to the select expression of the providing controller
 * items:   Binds the result set between the providing controller and twcTypeahead directive
 * pattern: Provides validation
 * @param  Timeout    $timeout
 * @param  Log        $log
 * @return Typeahead Template and Config
 */
twc.shared.apps.directive('twcTypeahead',['$timeout', '$log', '$swipe', '$rootScope', 'twcConstant', 'customEvent', 'twcUtil', 'aliases', function ($timeout, $log, $swipe, $rootScope, twcConstant, customEvent, twcUtil, aliases) {
  'use strict';
  var ascii = twcConstant.ascii;
  //  var logger = $log.getInstance('twcTypeahead');
  return {
    restrict: 'EA',
    transclude: true,
    replace: true,
    templateUrl: function (element, attrs) {
      var templatePath = '/sites/all/modules/custom/angularmods/app/shared/twc_typeahead/templates/';
      var device = $rootScope.isMobile ? 'nemo' : 'global';
      var template = attrs.template;
      var basicTemplate = (angular.element('html').hasClass('lt-ie9') || angular.element('html').hasClass('ie-9')) ? '_twc_typeahead_ie8.html' : '_twc_typeahead_basic.html';
      basicTemplate = template ? template + '.html' : basicTemplate;
      return (attrs.template ? templatePath + attrs.template + '.html' : templatePath + device + basicTemplate);
    },
    scope: {
      search: '&',
      term: '=',
      select: '&',
      items: '=',
      pattern: '@',
      formClass: '@',
      iconClass: '@',
      placeholderText: '@',
      validateClass: '@',
      tooltip: '@',
      inputClass: '@',
      containerClass: '@',
      hideSearchIcon: '='
    },
    controller: ['$scope', function ($scope) {

      $scope.goSearch = function () {
        $scope.itemsHidden = false;
        /*if($scope.term) {*/ $scope.search({term:$scope.term}); /*}*/
      };

      $scope.isHighLighted = function () {
        return !$scope.itemsHidden && ($scope.mouseOver || $scope.hasFocus);
      };

      this.get$scope = function () {
        return $scope;
      };
      this.getActiveItem = function () {
        return $scope.activeItem;
      };

      this.setActiveItem = function (item) {
        $scope.activeItem = item || null;
      };

      this.setDefaultActiveItem = function () {
        var items = $scope.items,
          initialActiveItem = items && items[0];
        if (initialActiveItem) {
          initialActiveItem.autoSelect = true;
          this.setActiveItem(initialActiveItem);
          $scope.$evalAsync(function () {
            $scope.itemsHidden = false;
          });
        } else {
          this.setActiveItem(null);
        }
      };

      this.selectActiveItem = function (enter) {
        var enterPressed = enter &&
          $scope.activeItem &&
          $scope.activeItem.autoSelect ?
          enter : false;
        this.selectItem($scope.activeItem, enterPressed);
      };

      this.selectItem = function (item, enterPressed) {
        if ($scope.activeItem && !$scope.activeItem.result) {
          if ($scope.input) {
            $scope.input.focus();
            if (Modernizr.touch) {
              // This is needed for touch device to trigger placeholder
              $scope.input.blur();
            }
          }
          $scope.hasFocus = true;
          $scope.itemsHidden = true;
        }

        // Treat enter as click if it is a recent search
        if (item && item.data && item.data.recentSearch) {
          item.autoSelect = enterPressed = false;
        }

        $scope.select({
          item:   item,
          enter:  enterPressed
        });
      };

      this.search = function () {
        $scope.search();
      };

      this.isItemActive = function (item) {
        return $scope.activeItem === item;
      };

      this.getActiveItemIndex = function () {
        return $scope.items.indexOf($scope.activeItem);
      };

      this.setNextItemActive = function () {
        this.setItemActiveAt(this.getActiveItemIndex() + 1);
      };

      this.setPrevItemActive = function () {
        this.setItemActiveAt(this.getActiveItemIndex() - 1);
      };

      this.setItemActiveAt = function (index) {
        var maxIndex = $scope.items.length - 1;

        if (index < 0) {
          index = maxIndex;
        }

        if (index > maxIndex) {
          index = 0;
        }

        var item = $scope.items[index];
        if (item) {
          item.autoSelect = false;
          this.setActiveItem(item);
        }
      };

      this.isEmpty = function () {
        return !$scope.term;
      };

      this.focusReset = function (flag) {
        $scope.$evalAsync(function () {
          $scope.hasFocus = flag;
          //input.attr('placeholder', flag ? '' : scope.placeholderText);
        });
      };

      if (!$scope.items) {
        $scope.items = [];
      } else {
        this.setDefaultActiveItem();
      }
    }],
    link: function (scope, element, attrs, controller) {
      var input     = element.find('form > input'),
        itemList    = element.find('div.menu'),
        searchIcon  = element.find('div.icon--search');
      // This is for placeholder text to show on blur only
      if (attrs.containerClass && attrs.containerClass === 'input-base') {
        scope.input = input;
      }

      //      scope.containerClass = attrs.containerClass ? attrs.containerClass : 'input-rebase';

      /**
       * Validate different use cases
       * @param reset
       * @param enter
       * @returns {boolean}
       */
      function validate(reset, enter) {
        // TODO:  thinking about abstracting this
        var valid = true,
          childScope, val;
        if (!scope.activeItem && enter === true) {
          // Check if users press enter with no search term
          childScope = scope.$$childHead ? scope.$$childHead : scope;
          if (reset === true) {
            valid = true;
          } else {
            valid = scope.term || scope.term && scope.term.length === 0 && scope.$parent.getRecentSearches && scope.$parent.getRecentSearches().length > 0 ? true : false;
            input.blur();
          }
          childScope.$apply(function () {
            childScope.isValid = valid;
          });
        } else if (scope.activeItem && scope.activeItem.result) {
          // Check if users press enter when there are no results
          if (scope.validateClass && scope.validateClass.length > 0) {
            childScope = scope.$$childHead ? scope.$$childHead : scope;
            val = scope.term;
            if (val.length > 0 && !aliases.specialty[val.toLowerCase()] && scope.activeItem.result !== 'Searching...' || val === scope.placeholderText) {
              valid = reset !== true ? false : true;
              childScope.$apply(function () {
                childScope.isValid = valid;
                if (!valid) {
                  scope.itemsHidden = true;
                  input.blur();
                }
              });
            }
          }
        }
        return valid;
      }

      /**
       * Adding this to fix ticket rebootkm-537
       * --cdub
       */
      function resetInputState() {
        // reset state of search
        scope.$apply(function () {
          scope.hasFocus = false;
        });
        validate(true, false);
      }
      customEvent.getEvent("page-back-event").progress(function () {
        resetInputState();
      });

      function focusReset(flag) {
        controller.focusReset(flag);
      }
      input.bind('focus', function () {
        focusReset(true);
      });

      scope.$watch('visible', function () {
        if (element.hasClass('mobile')) {
          input.focus();
        }
        if (searchIcon.length === 0) {
          searchIcon = element.find('div.icon--search');
          searchIcon.length === 0 || searchIcon.bind('click', function () {
            if (input.val().length > 0 && validate(false, false)) {
              scope.$apply(function () {
                controller.selectActiveItem();
              });
            } else if (scope.activeItem && scope.activeItem.result) {
              scope.$apply(function () {
                scope.hasFocus = true;
                scope.itemsHidden = false;
              });
            }
          });
        }
      });

      scope.$watch('hasFocus', function (hasFocus) {
        $rootScope.$broadcast('twcTypeahead.input.focus', hasFocus);
        if (hasFocus) {
          // if already has input focus, skip dirty checking in angular world
          // TODO:  Because mobile design we have to fire focus again to really get focus in the input, isMobile check should be removed when design changes
          //          if(scope.$root.isMobile || !input.is(':focus')) {
          //            $timeout(function() {
          //              validate(true, false);
          //              input.focus();
          //            }, 0, false);
          //          }
        }
      });

      scope.$watch('itemsHidden', function (itemsHidden) {
        //$rootScope.$broadcast('twcTypeahead.input.itemsHidden', itemsHidden);
      });

      if (Modernizr.touch) {
        input.bind('click', function () {
          input.focus();
          $rootScope.$broadcast('twcTypeahead.mobile.input.focus', scope.hasFocus);
        });

        customEvent.getEvent('touch-on-body-event').progress(function (e) {
          if (!scope.$root.isMobile && scope.itemsHidden === false && scope.mouseOver === false) {
            scope.$apply(function () {
              scope.hasFocus = false;
            });
          }
        });
      }

      input.bind('blur', function () {
        focusReset(false);
        //$rootScope.$broadcast('twcTypeahead.input.focus', scope.hasFocus);
      });

      itemList.bind('mouseover', function () {
        scope.$apply(function () {
          scope.mouseOver = true;
        });
      });

      itemList.bind('mouseleave', function () {
        scope.$apply(function () {
          scope.mouseOver = false;
        });
      });

      input.bind('keyup', twcUtil.debounce(function (evt) {
        if (evt.keyCode === ascii.CR) {
          var timeout = controller.getActiveItem().data ? 0 : scope.term.length < 3 ? 0 : 850;
          $timeout(function () {
            if (validate(false, true)) {
              scope.$apply(function () {
                controller.selectActiveItem(true);
              });
            }
          }, timeout);
        } else if (evt.keyCode === ascii.ESC) {
          input.blur();
        }
      },30));

      // Android KEYCODE_SEARCH, FLAG_EDITOR_ACTION
      input.bind('keydown', function (evt) {
        if (evt.keyCode === ascii.CR || evt.keyCode === ascii.ESC) {
          evt.preventDefault();
        } else if (evt.keyCode === ascii.DOWN) {
          evt.preventDefault();
          scope.$apply(function () {
            controller.setNextItemActive();
          });
        } else if (evt.keyCode === ascii.UP) {
          evt.preventDefault();
          scope.$apply(function () {
            controller.setPrevItemActive();
          });
        } else {
          validate(true, false);
        }
      });

      scope.$watch('items', function (newItems, oldItems) {
        if (oldItems !== newItems) {
          controller.setDefaultActiveItem();
        }
      });

      scope.$watch('isHighLighted()', function (hilite) {
        //        logger.debug('test hightlight ' + hilite);
        if (hilite) {
          itemList.css({
            display: 'block',
            position: 'absolute',
            width: input[0].offsetWidth
          });
        } else {
          itemList.css('display', 'none');
        }
      });

    }
  };
}])
  .directive('twcTypeaheadItem',['$swipe', '$log', '$compile', 'customEvent', function ($swipe, $log, $compile, customEvent) {
    'use strict';

    return {
      require:    '^twcTypeahead',
      transclude: 'true',
      template:   '<div ng-click="selectItem()" ng-class="{\'twc-typeahead-item-active\': isActive()}"><div ng-transclude></div></div>',
      link: function (scope, element, attrs, controller) {
        var item = scope.$eval(attrs.twcTypeaheadItem);

        scope.isActive = function () {
          return controller.isItemActive(item);
        };

        scope.selectItem = function () {
          item.autoSelect = false;
          scope.$evalAsync(function () {
            controller.selectItem(item);
          });
          if (Modernizr.touch && angular.element(element).hasClass('for-touch')) {
            // ng-click seems to have lost on subsequent touch, need to recomile for touch devices
            $compile(element)(scope);
          }
        };

        if (Modernizr.touch) {
          $swipe.bind(element, {
            start: function () {}
          });
        }

        element.bind('mouseenter', function () {
          scope.$apply(function () {
            controller.setActiveItem(item);
          });
        });

        if (!controller.isEmpty() && scope.$last) {
          // Notify search-in-progress complete event, results are being displayed
          customEvent.removeEvent('search-in-progress');
          customEvent.getEvent('search-in-progress').resolve({item: controller.getActiveItem()});
        }
      }
    };
  }]);
;
/**
 * User: Jeff Lu
 * Date: 1/16/2014
 * Time: 18:2
 * Modified: Thomas.Vo 4/8/2014
 *
 * This directive will select the text only upon focus
 * Example usage: <input twc-select-text />
 */

/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcSelectText', function () {
  'use strict';
  return {
    restrict: 'A',
    link: function (scope, element) {
      var preventMouseUpDeselect = false;

      element.mouseup(function (e) {
        if (preventMouseUpDeselect) {
          // When a focus is triggered by a click,
          // "mouseup" event will clear the text selection.
          // That's why we need this logic to prevent it from
          // deselecting our selection.
          e.preventDefault();
          preventMouseUpDeselect = false;
        }
      });

      element.mousedown(function () {
        preventMouseUpDeselect = false;
      });

      element.on('focusin',function (e) {
        e.preventDefault();

        // NOTE: setTimeout has to be there
        // to ensure that selection is always applied.
        // In special cases where when the text input is clicked,
        // while, at the same time, the input shortens or shifts out
        // of the mouse position, selection will be lost if setTimeout is not there.
        // HOWEVER, if we remove the one without setTimeout, clicking at the middle
        // of the text will only select up to the character where the click is trigger.
        element.select();
        setTimeout(function () {
          element.select();
        });

        preventMouseUpDeselect = true;
      });
    }
  };
});
;
/**
 * User: Ankit Parekh
 * Date: 4/10/2014
 * Time: 11:6
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcInputErrorState', function () {
  return {
    restrict: 'A',
    scope: {
      isValid: '@'
    },

    link: function (scope, element, attrs) {
      var vclass = attrs.twcInputErrorState;

      scope.$watch('isValid', function (isValid) {
        if (vclass) {
          Boolean(isValid) ? element.removeClass(vclass) : element.addClass(vclass);
        }
      });
    }
  };});
;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 12/18/13
 * Time: 10:18 PM
 * To change this template use File | Settings | File Templates.
 */

twc.shared.apps.directive('twcPlaceholder',['$timeout', function ($timeout) {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      scope.text = attrs.twcPlaceholder;
      var setPlaceholder = function (placeIt) {
        if (element.val().length === 0) {
          scope.$apply(function () {
            element.val(placeIt ? scope.text : '');
          });
        }
      };
      element.bind('focus', function () {
        if (element.val() === scope.text) {
          scope.$apply(function () {
            element.val('');
          });
        }
      });

      element.bind('blur', function () {
        if (element.val() === '') {
          setPlaceholder(true);
        }
      });

      scope.$watch('term', function (nVal, oVal) {
        if (nVal !== oVal) {
          if ((!nVal || nVal.length === 0) && element.hasClass('manage-location-input')) {
            element.val(scope.text);
          }
        }
      });

      setTimeout(function () {
        element.val(scope.text);
      }, 50);

    }
  };
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 2/8/14
 * Time: 6:42 PM
 * To change this template use File | Settings | File Templates.
 */

twc.shared.apps.factory('XwebWebLocModelClass',['RecordModel', 'twcUtil', 'twcConstant', 'pcoUser' ,function(RecordModel, twcUtil, twcConstant, pcoUser){
  return RecordModel.extend({
    recordType: 'WebLoc',
    isCacheable: false,

    setResponse: function( response ) {
      this.data = response;
      this.header = "NA";
    },

    getFormattedName: function(isMobile, longRc) {
      var locTypes = twcConstant.locTypes;
      var types = [locTypes.Airports, locTypes.Ski, locTypes.Golf, locTypes.Lakes, locTypes.Outdoor, locTypes.Parks];
      var country = this.getCountryCode() === 'US' && this.getLocType() === 1 || this.getCountryCode() !== 'US' ? twcUtil.capitalize(this._get('_country'), true) : '';
      var regionName = this.getStateCode().length > 0 ? country.length > 0 ? twcUtil.capitalize(this.getState(), true, true) + ', ' : twcUtil.capitalize(this.getState(), true, true) : '';
      var region = longRc ? regionName + country : this._get('stCd');
      var presName = twcUtil.capitalize(this.getCity(), true, true);
      var name3 = types.indexOf(this.getLocType()) >= 0 && this.getParentCity() ? this.getParentCity() + ', ' : '';
      var name1 = twcUtil.capitalize(this.getCity(), true, true) + ', ' + name3 + region;
      var zip = this.getLocId();
      var zipSearch = this.getLocType() === locTypes.Zips && (twcUtil.isNumeric(zip) || this.getCountryCode() !== 'US') ? ' (' + zip + ')' : '';
      // adding the changes for titan to display state code instead of state name
      var name, name2;
      if(TWC && TWC.Titan && TWC.Titan.locale) {
        name2 = regionName.length > 0 ? presName + (this._get('stCd') !== '' && this._get('stCd') !== '*' ? ', ' + this._get('stCd') : '') : presName;
        name = this.getCountryCode() === 'US' ? name1 + zipSearch : twcUtil.capitalize(name2 + (zipSearch.length > 0 ? " " + zipSearch : ""), false) + ', ' + country;
      } else {
        name2 = regionName.length > 0 ? presName + ', ' + name3 + this._get('stNm') : presName;
        name = this.getCountryCode() === 'US' ? name1 + zipSearch : twcUtil.capitalize(name2, true, true) + ', ' + country;
      }
      return name;
    },

    getFormattedNameIntl: function() {
      var locTypes = twcConstant.locTypes,
        types = [locTypes.Airports, locTypes.Ski, locTypes.Golf, locTypes.Lakes, locTypes.Outdoor, locTypes.Parks],
        locale = pcoUser.getLocale(),
        defaultCountryCodeForLocale = (twcConstant.localeToCountry[locale] || 'US').toUpperCase();
      var country = this.getCountryCode() === defaultCountryCodeForLocale && this.getLocType() === 1 || this.getCountryCode() !== defaultCountryCodeForLocale ? twcUtil.capitalize(this._get('_country'), true) : '';
      var region = this._get('stNm') || this._get('stCd');
      var name3 = types.indexOf(this.getLocType()) >= 0 && this.getParentCity() ? this.getParentCity() + ', ' : '';
      var name1 = this.getCity() + ', ' + name3 + region;
      var zipSearch = this.getLocType() === locTypes.Zips ? ' (' + this.getLocId() + ')' : '';

      var name = this.getCountryCode() === defaultCountryCodeForLocale ? name1 + zipSearch : name1 + zipSearch + ', ' + country;

      return name;
    },

    getId: function() {
      return this._get('id');
    },

    isBigCity: function() {
      return this._get('bigCity');
    },

    getCityName: function() {
      return this._get('cityNm');
    },

    getName: function() {
      return this._get('name');
    },

    getFullName: function() {
      return this.getFormattedName();
    },

    getFullLocId: function() {
      return this.getLocId() + ':' + this.getLocType() + ':' + this.getCountryCode();
    },

    getNickname: function() {
      var nickname = this._get('nickname');
      return angular.isString(nickname) ? nickname.trim() : nickname;
    },

    getCountryCode: function() {
      return this._get('cntryCd');
    },

    getKey: function() {
      return this._get('key');
    },

    getCountryName: function() {
      return this._get('_country');
    },

    getLocId: function() {
      return this._get('locId');
    },

    getLocType: function() {
      return this._get('locType');
    },

    getPresName: function() {
      return this._get('prsntNm');
    },

    getRegionCode: function() {
      return this._get('stCd');
    },

    getRegionName: function() {
      return this._get('stNm');
    },

    getStateName: function() {
      return this.getRegionName();
    },

    getStateCode: function() {
      return this._get('stCd') ? this._get('stCd') : '';
    },

    /**
     * Trying to standardize getters across wxdLoc, xwebLoc & savedLocations Models
     * @returns {*}
     */

    getParentCity: function() {
      return this._get('parentCity');
    },

    getState: function() {
      return this._get('stNm') ? this._get('stNm') : '';
    },

    getCity: function() {
      return this._get('cityNm');
    },

    getCountry: function() {
      return this._get('_country');
    },

    getAddress : function() {
        return this._get('addr');
    },

    // DKB-1499 requires a zipCd.
    // Putting this in because webLoc's
    // Do not have zipCd
    getZipCode: function() {
      var locId = this.getKey(),
          zip = locId.match(/(\d{5}):4:/);
      return zip && zip[1] || "";
    },

    getPosition : function() {
      return this._get('position');
    },

    getGeocode: function () {
      var _return;
      if(this._get('lat')){
        _return = this._get('lat') + ',' + this._get('long');
      } else {
        _return = this._get('geocode') || this._get('geoCode');
      }
      return _return;
    }


  });
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: geethavasudevan
 * Date: 9/9/14
 * Time: 10:47 AM
 * To change this template use File | Settings | File Templates.
 */

twc.shared.apps.factory('MediaAssetFactory',['dsxclient', '$q', function (dsxclient, $q) {

  return {

    getAssetModel:function (response, assetId) {

      // check if asset id contains ugc provider id
      if (assetId.indexOf('db04bc18-ee64-11e2-9ee2-001d092f5a10') !== -1) {
        return 'ugcAssetWithColl';
      } else {// check actual data to make decision

        var rawResponse = response.attrs['rawResponseMap'];
        var assetObj = rawResponse['/cms/asset-collection/' + assetId];
        if (assetObj && assetObj.doc && assetObj.doc.providerid) {
          var assetProviderId = assetObj.doc.providerid;
          if (assetProviderId != null && assetProviderId === 'db04bc18-ee64-11e2-9ee2-001d092f5a10') {
            return 'ugcAssetWithColl';
          } else if (assetProviderId !== null && assetObj.doc.type === 'video') {
            return 'videoAssetWithColl';
          }
        }

      }
      // return "a"; //return default cmsAModel
      // Setting default to first class video object model per PM's decision
      return 'videoAssetWithColl';

    },

    getMediaAssetData: function (assetInfo) {
      var _self = this;
      var results = {};
      var assetIdConfig = {
        $id: assetInfo.id,
        recordType: 'cms',
        recordName: 'videoAssetWithColl',
        assetId: assetInfo.assetId
      };

      if (!assetInfo.assetId) {
        return null;
      }

      var promise = dsxclient.execute([assetIdConfig]),
            deferred = $q.defer();

      promise['then'](function (response) {
        var modelType = _self.getAssetModel(response, assetInfo.assetId);
        var massagedResponse = response.getModel({
          $id: assetInfo.id,
          recordType: 'cms',
          recordName: modelType,
          assetId: assetInfo.assetId
        });

        results[assetInfo.id] = massagedResponse;
        promise.$setResults(results);

        deferred.resolve(massagedResponse);

      });

      return deferred.promise;

    }

  };
}]);

;
/**
 * User: Jeff Lu
 * Date: 9/3/2014
 * Time: 08:20
 *
 * Introducing reference scope directive to allow nested directives to execute methods in the context parent controller scope.
 *
 * Use case:  Have you found yourself pulling your hair out trying to figure out what scope you're working with and in order
 * to get to the right scope you might have done something like $scope.$parent.$parent.  This looks nasty and makes your directive
 * not so reusable.  For simple directive, we can pass in properties and methods with no problem.  The problem comes when we have directive
 * that depends on other directives or directive is placed by ng-repeat.  And each has its own scope, depending on where you are doing the
 * operations or making the function call, you may not be operating in the context you thought you are.  For an example of how twcReference
 * is used, please refer to social_sharing module
 *
 * Another thing to note is that we should consider using a callback function rather than passing in different functions.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcReferenceScope', function ($rootScope) {
  'use strict';
  return {
    restrict: 'A',
    controller: function ($scope) {
      this.refScope = function () {
        return $scope.refScope;
      };
    },
    link: function (scope, element, attrs, ctrl) {
      scope.refScope = scope.$eval(attrs.twcReferenceScope);
    }
  };
});
;
(function (angular, twc) {
  'use strict';

  /**
   * @ngdoc provider
   * @name shared.socialConstants
   * @description Social constants.
   */
  twc.shared.apps
    .provider('socialConstants', ['twcConstant', function SocialConstants(twcConstant) {

      this.$inject = ['$location'];

      return {
        $get: function ($location) {
          var name = 'The Weather Channel';
          return {
            basePath: 'https://' + $location.host(),
            securePath: 'https://ssl.weather.com',
            playerSwf: '/sites/all/modules/custom/angularmods/app/shared/videoamp/lib/amp.premier/AkamaiPremierPlayer.swf',
            logoImage: twcConstant.assetsUrl + '240x180_twc_default.png',
            site_name: name,
            twitterSite: '@weatherchannel',
            address: {
              streetAddress: '300 Interstate North Pkwy',
              addressLocality: 'Atlanta, Georgia',
              postalCode: '30339'
            },
            profiles: {
              facebook: 'https://www.facebook.com/TheWeatherChannel',
              twitter: 'https://www.twitter.com/weatherchannel',
              instagram: 'http://instagram.com/weatherchannel',
              googleplus: 'https://plus.google.com/+TheWeatherChannel/posts',
              youtube: 'http://www.youtube.com/user/TheWeatherChannel'
            },
            apps: {
              itunes: {
                ipad: {
                  name: 'The Weather Channel App for iPad',
                  id: '364252504',
                  url: 'https://itunes.apple.com/us/app/weather-channel-app-for-ipad/id364252504?mt=8'
                },
                iphone: {
                  name: name,
                  id: '295646461',
                  url: 'https://itunes.apple.com/us/app/weather-channel-local-forecasts/id295646461?mt=8'
                }
              },
              googleplay: {
                name: name,
                id: 'com.weather.Weather',
                url: 'https://play.google.com/store/apps/details?id=com.weather.Weather'
              },
              facebook: {
                app_id: '115862191798713',
                profile_id: 'TheWeatherChannel'
              },
              windows: {
                'msapplication-config': 'https://s.w-x.co/tile.xml',
                // https://msdn.microsoft.com/library/hh781489(v=vs.85).aspx
                // https://msdn.microsoft.com/en-us/library/hh781489(v=vs.85).aspx
                // https://msdn.microsoft.com/en-us/library/dn255024(v=vs.85).aspx
                // https://msdn.microsoft.com/en-us/library/gg491732(v=vs.85).aspx
                'msApplication-ID': 'Weather.TheWeatherChannel',
                'msApplication-PackageFamilyName': 'Weather.TheWeatherChannel_t3yemqpq4kp7p',
                'application-name': name,
                'msapplication-tooltip': name,
                'msapplication-starturl': '/',
                //'msapplication-navbutton-color': '',
                //'msapplication-window': 'width=1024;height=768',
                // @todo https://msdn.microsoft.com/library/bg183312(v=vs.85).aspx
                'msapplication-task': [
                  'name=' + name + ';action-uri=https://weather.com;icon-uri=https://weather.com/favicon.ico',
                  'name=' + name + ' on Twitter;action-uri=https://www.twitter.com/weatherchannel;icon-uri=http://twitter.com/favicon.ico',
                  'name=' + name + ' on Facebook;action-uri=https://www.facebook.com/TheWeatherChannel;icon-uri=https://s-static.ak.facebook.com/rsrc.php/yi/r/q9U99v3_saj.ico',
                  'name=' + name + ' on Google+;action-uri=https://plus.google.com/+TheWeatherChannel/posts;icon-uri=http://linkedin.com/favicon.ico',
                  'name=' + name + ' on Instagram;action-uri=http://instagram.com/weatherchannel;icon-uri=http://linkedin.com/favicon.ico',
                  'name=' + name + ' on YouTube;action-uri=http://www.youtube.com/user/TheWeatherChannel;icon-uri=https://s.ytimg.com/yts/img/favicon-vflz7uhzw.ico'
                ]
              }
            },
            // @see https://developer.apple.com/library/iad/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
            //apple: {
            //  'mask-icon': '', // Safari 9 Pinned tabs in El Capitan
            //  'apple-mobile-web-app-title': '',
            //  'apple-mobile-web-app-capable': '',
            //  'apple-touch-fullscreen': '',
            //  'apple-mobile-web-app-status-bar-style': '',
            //  'format-detection': ''
            //},
            //links: {
              //'apple-touch-icon',
              //'apple-touch-startup-image',
              //'apple-touch-icon-precomposed'
            //},
            urlParams: {
              facebook: 'utm_medium=social&utm_source=facebook&cm_ven=Facebook&cm_cat=www.facebook.com&cm_pla=fb_feed&cm_ite=fb_social_rec&fb_ref=ls_share',
              twitter: 'utm_medium=social&utm_source=twitter&cm_ven=Twitter&cm_cat=www.twitter.com&cm_pla=tw_feed&cm_ite=tw_social_tweet',
              reddit: 'utm_medium=social&utm_source=reddit&cm_ven=Reddit&cm_cat=www.reddit.com&cm_pla=r_feed&cm_ite=r_social_post',
              pinterest: 'utm_medium=social&utm_source=pinterest&cm_ven=Pinterest&cm_cat=www.pinterest.com&cm_pla=p_feed&cm_ite=p_social_pin',
              googleplus: 'utm_medium=social&utm_source=googleplus&cm_ven=GooglePlus&cm_cat=plus.google.com&cm_pla=gp_feed&cm_ite=gp_social_post',
              email: 'utm_medium=email&utm_source=website&cm_ven=Email&cm_cat='
            },
            metaSchema: {
              al: [],
              article: [
                'published_time',
                'modified_time',
                'expiration_time',
                'author',
                'section',
                'tag'
              ],
              fb: [
                'admins',
                'profile_id',
                'app_id'
              ],
              og: [
                'image', 'image:url', 'image:secure_url', 'image:type', 'image:width', 'image:height',
                'video', 'video:url', 'video:secure_url', 'video:type', 'video:width', 'video:height',
                'audio', 'audio:url', 'audio:secure_url', 'audio:type',
                'title', 'type', 'url', 'description', 'site_name',
                'locale', 'locale:alternative',
                'restrictions:country', 'restrictions:age',
                'updated_time', 'see_also', 'rich_attachment', 'ttl'
              ],
              profile: [
                'first_name',
                'last_name',
                'username',
                'gender'
              ],
              twitter: [
                'card', 'creator', 'creator:id',
                'site', 'site:id', 'description', 'title', 'image', 'url',
                'player', 'player:width', 'player:height', 'player:stream', 'player:stream:content_type',
                'app:country',
                'app:name:iphone', 'app:id:iphone', 'app:url:iphone',
                'app:name:ipad', 'app:id:ipad', 'app:url:ipad',
                'app:name:googleplay', 'app:id:googleplay', 'app:url:googleplay'
              ]
            },

            /**
             * Omniture Events
             *
             * @see rnrOmnitureValues event53, event55
             * @type {{facebook: string, twitter: string, pinterest: string, reddit: string, googleplus: string, email: string}}
             */
            omnitureEvents: {
              facebook: 'event53,event57',
              twitter: 'event55,event57',
              pinterest: 'event62,event57',
              reddit: 'event67,event57',
              googleplus: 'event61,event57',
              email: 'event56,event57'
            }
          };
        }
      };
    }]);
})(angular, twc);

;
/**
 * User: Jeff Lu
 * Date: 1/21/2014
 * Time: 10:54
 */

twc.shared.apps.run(['$swipe', 'customEvent', '$window', 'twcUtil', 'twcConstant', '$rootScope', function ($swipe, customEvent, $window, twcUtil, twcConstant, $rootScope) {
  (function () {
    /**
     * Provides a cross-window communication channel through postMessage API
     *
     */
    var whiteList = [
      'https://profile.weather.com',
      'https://profile.oqc.weather.com',
      'http://localhost.weather.com:9000',
      'https://localhost.weather.com:9000',
      'http://twcrb.dev.weather.com',
      'https://twcrb.dev.weather.com',
      'http://twcstory-aws.web.weather.com',
      'https://twcstory-aws.web.weather.com',
      'http://adev.weather.com',
      'https://adev.weather.com',
      'http://astg.weather.com',
      'https://astg.weather.com',
      'http://astg2.weather.com',
      'https://astg2.weather.com',
      'http://astg4.weather.com',
      'https://astg4.weather.com',
      'http://www.weather.com',
      'https://www.weather.com',
      'http://weather.com',
      'https://weather.com',
      'http://burda-dev-edit.weather.com',
      'https://burda-dev-edit.weather.com',
      'http://burda-dev.weather.com',
      'https://burda-dev.weather.com',
      'http://burda-stage.weather.com',
      'https://burda-stage.weather.com',
      'http://burda-stage-edit.weather.com',
      'https://burda-stage-edit.weather.com',
      'http://edit.weather.com',
      'https://edit.weather.com',
      'http://adev2.weather.com',
      'https://adev2.weather.com',
      'http://adev3.weather.com',
      'https://adev3.weather.com',
      'https://drupal-stage-web.weather.com',
      'http://drupal-stage-web.weather.com',
      'https://drupal-prod-web.weather.com',
      'http://drupal-prod-web.weather.com',
      'http://drupal-dev-web.weather.com',
      'https://drupal-dev-web.weather.com'
    ];

    var listener = function (event) {
      if (whiteList.indexOf(event.origin) < 0) {
        return;
      }
      var type = event.data.type;
      type = type ? type + '-post-message' : null;
      if (type) {
        customEvent.getEvent(type).notify(event.data);
      }
    };
    if ($window.addEventListener) {
      addEventListener('message', listener, false);
    } else {
      attachEvent('onmessage', listener);
    }
  })();

  if ('ontouchstart' in document.documentElement) {
    // not sure why binding to document.documentElement seems to crash safari(?)
    $swipe.bind(angular.element(document).find('html'), {
      start: function (pt, e) {
        // wouldn't e.currentTarget.nodeName ALWAYS be 'HTML' because you delegated the event event to document.documentElement?
        (e.currentTarget.nodeName === 'HTML') && customEvent.getEvent('touch-on-body-event').notify(e);
      },
      cancel: function (pt) {
      }
    });
  }

  angular.element($window).resize(twcUtil.debounce(function (evt) {
    angular.element(this).trigger('ScreenResizeEnd');
  }, 300)
);

  // ONLY BEING USED WITH THE IN VIEW BEACON DIRECTIVE TO CHECK IF THE AD WAS VIEWED FOR 1 SEC, HENCE THE DEBOUNCE DELAY IS 1000ms
  angular.element($window).scroll(twcUtil.debounce(function (evt) {
    angular.element(this).trigger('ScreenScrolled');
  }, 1000)
);

  // ONLY BEING USED WITH THE IN VIEW BEACON DIRECTIVE TO CHECK IF THE AD WAS VIEWED FOR 1 SEC, HENCE THE DEBOUNCE DELAY IS 1000ms
  angular.element($window).resize(twcUtil.debounce(function (evt) {
    angular.element(this).trigger('ScreenResizeEnd1Sec');
  }, 1000)
);

  if (Boolean(angular.element.cookie('debug'))) {
    var ascii = twcConstant.ascii;
    var beenHere = false;
    angular.element('body').on('mousedown mousemove', twcUtil.debounce(function (e) {
      twcConstant.holdShiftKey = e.shiftKey;
      twcConstant.holdAltKey = e.altKey;
      if (e.which === 1 && twcConstant.holdShiftKey && twcConstant.holdAltKey) {
        if (e.type === 'mousemove') {
          var selectedModule = angular.element(e.target).closest('[data-twc-controller]');
          if (selectedModule.length > 0) {
            $rootScope.$log.log(Drupal.settings.twc.instance[selectedModule.attr('instance')]);
            if (!beenHere) {
              $rootScope.$log.log('Total of ', Object.keys(Drupal.settings.twc.instance).length, ' modules on the page.');
              beenHere = true;
            }
          }
        }
      }
    }, 300));
  }
}]);

// TODO:  The following directives will be deprecated and be replaced by twc_keypress directive which is a generic keyboard event handler
twc.shared.apps.directive('twcClick', function () {
  return function (scope, element, attrs) {
    element.bind('click', function (evt) {
      evt.preventDefault();
      scope.$apply(function () {
        scope.$eval(attrs.twcClick);
      });
    });
  };
});

twc.shared.apps.directive('documentClick', function ($document, $parse) {
  var linkFunction = function ($scope, $element, $attributes) {
    var scopeExpression = $attributes.documentClick;
    var invoker = $parse(scopeExpression);
    $document.on('click', function (event) {
      $scope.$apply(function () {
        invoker($scope, {$event: event});
      });
    });
  };
  return linkFunction;
});

twc.shared.apps.directive('twcEnter',['twcConstant', function (twcConstant) {
  return function (scope, element, attrs) {
    element.bind('keydown keypress', function (evt) {
      if (evt.which === twcConstant.ascii.CR) {
        evt.preventDefault();
        scope.$apply(function () {
          scope.$eval(attrs.twcEnter);
        });
      }
    });
  };
}]);
;
/** Copyright 2013 mocking@gmail.com * http://github.com/relay/anim

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

var anim = function(A) {
"use strict";

A = function(n, g, t, e) {
  var a, o, c,
    q = [],
    cb = function(i) {
      //our internal callback function maintains a queue of objects 
      //that contain callback info. If the object is an array of length
      //over 2, then it is parameters for the next animation. If the object
      //is an array of length 1 and the item in the array is a number,
      //then it is a timeout period, otherwise it is a callback function.
      if(i = q.shift()) i[1] ?
          A.apply(this, i).anim(cb) :
          i[0] > 0 ? setTimeout(cb, i[0]*1000) : (i[0](), cb())
    };

  if(n.charAt) n = document.getElementById(n);

  //if the 1st param is a number then treat it as a timeout period.
  //If the node reference is null, then we skip it and run the next callback
  //so that we can continue with the animation without throwing an error.
  if(n > 0 || !n) g = {}, t = 0, cb(q = [[n || 0]]);

  //firefox don't allow reading shorthand CSS styles like "margin" so
  //we have to expand them to be "margin-left", "margin-top", etc.
  //Also, expanding them allows the 4 values to animate independently 
  //in the case that the 4 values are different to begin with.
  expand(g, {padding:0, margin:0, border:"Width"}, [T, R, B, L]);
  expand(g, {borderRadius:"Radius"}, [T+L, T+R, B+R, B+L]);

  //if we animate a property of a node, we set a unique number on the
  //node, so that if we run another animation concurrently, it will halt
  //the first animation. This is needed so that if we animate on mouseover
  //and want to reverse the animation on mouseout before the mouseover
  //is complete, they won't clash and the last animation prevails.
  ++mutex;

  for(a in g) {
    o = g[a];
    if(!o.to && o.to !== 0) o = g[a] = {to: o};  //shorthand {margin:0} => {margin:{to:0}}

    A.defs(o, n, a, e);  //set defaults, get initial values, selects animation fx
  }

  A.iter(g, t*1000, cb);

  return {
    //this allows us to queue multiple animations together in compact syntax
    anim: function() {
      q.push([].slice.call(arguments));
      return this
    }
  }
};

var T="Top", R="Right", B="Bottom", L="Left",
  mutex = 1,

  //{border:1} => {borderTop:1, borderRight:1, borderBottom:1, borderLeft:1}
  expand = function(g, dim, dir, a, i, d, o) {
    for(a in g) {  //for each animation property
      if(a in dim) {
        o = g[a];
        for(i = 0; d = dir[i]; i++)  //for each dimension (Top, Right, etc.)
          //margin => marginTop
          //borderWidth => borderTopWidth
          //borderRadius => borderTopRadius
          g[a.replace(dim[a], "") + d + (dim[a] || "")] = {
            to:(o.to === 0) ? o.to : (o.to || o), fr:o.fr, e:o.e
          };
        delete g[a];
      }
    }
  },

  timeout = function(w, a) {
    return w["webkitR"+a] || w["r"+a] || w["mozR"+a] || w["msR"+a] || w["oR"+a]
  }(window, "equestAnimationFrame");

A.defs = function(o, n, a, e, s) {
  s = n.style;
  o.a = a;  //attribute
  o.n = n;  //node
  o.s = (a in s) ? s : n;  //= n.style || n
  o.e = o.e || e;  //easing

  o.fr = o.fr || (o.fr === 0 ? 0 : o.s == n ? n[a] :
        (window.getComputedStyle ? getComputedStyle(n, null) : n.currentStyle)[a]);

  o.u = (/\d(\D+)$/.exec(o.to) || /\d(\D+)$/.exec(o.fr) || [0, 0])[1];  //units (px, %)

  //which animation fx to use. Only color needs special treatment.
  o.fn = /color/i.test(a) ? A.fx.color : (A.fx[a] || A.fx._);

  //the mutex is composed of the animating property name and a unique number
  o.mx = "anim_" + a;
  n[o.mx] = o.mxv = mutex;
  if(n[o.mx] != o.mxv) o.mxv = null;  //test expando
};

A.iter = function(g, t, cb) {
  var _, i, o, p, e,
    z = +new Date + t,

  _ = function(now) {
    /** => Modified by Thomas Vo June 10, 2014 */
    i = z - new Date().getTime();
    /** => End modification */

    if(i < 50) {
      for(o in g)
        o = g[o],
        o.p = 1,
        o.fn(o, o.n, o.to, o.fr, o.a, o.e);

      cb && cb()

    } else {

      i = i/t;

      for(o in g) {
        o = g[o];

        if(o.n[o.mx] != o.mxv) return;  //if mutex not match then halt.

        e = o.e;
        p = i;

        if(e == "lin") {
          p = 1 - p
  
        } else if(e == "ease") {
          p = (0.5 - p)*2;
          p = 1 - ((p*p*p - p*3) + 2)/4
  
        } else if(e == "ease-in") {
          p = 1 - p;
          p = p*p*p
  
        } else {  //ease-out
          p = 1 - p*p*p
        }
        o.p = p;
        o.fn(o, o.n, o.to, o.fr, o.a, o.e)
      }
      timeout ? timeout(_) : setTimeout(_, 20, 0)
    }
  }
  _();
};

A.fx = {  //CSS names which need special handling

  _: function(o, n, to, fr, a, e) {  //for generic fx
    fr = parseFloat(fr) || 0,
    to = parseFloat(to) || 0,
    o.s[a] = (o.p >= 1 ? to : (o.p*(to - fr) + fr)) + o.u
  },

  width: function(o, n, to, fr, a, e) {  //for width/height fx
    if(!(o._fr >= 0))
      o._fr = !isNaN(fr = parseFloat(fr)) ? fr : a == "width" ? n.clientWidth : n.clientHeight;
    A.fx._(o, n, to, o._fr, a, e)
  },

  opacity: function(o, n, to, fr, a, e) {
    if(isNaN(fr = fr || o._fr))
      fr = n.style,
      fr.zoom = 1,
      fr = o._fr = (/alpha\(opacity=(\d+)\b/i.exec(fr.filter) || {})[1]/100 || 1;
    fr *= 1;
    to = (o.p*(to - fr) + fr);
    n = n.style;
    if(a in n) {
      n[a] = to
    } else {
      n.filter = to >= 1 ? "" : "alpha(" + a + "=" + Math.round(to*100) + ")"
    }
  },

  color: function(o, n, to, fr, a, e, i, v) {
    if(!o.ok) {
      to = o.to = A.toRGBA(to);
      fr = o.fr = A.toRGBA(fr);
      if(to[3] == 0) to = [].concat(fr), to[3] = 0;
      if(fr[3] == 0) fr = [].concat(to), fr[3] = 0;
      o.ok = 1
    }

    v = [0, 0, 0, o.p*(to[3] - fr[3]) + 1*fr[3]];
    for(i=2; i>=0; i--) v[i] = Math.round(o.p*(to[i] - fr[i]) + 1*fr[i]);

    if(v[3] >= 1 || A.rgbaIE) v.pop();

    try {
      o.s[a] = (v.length > 3 ? "rgba(" : "rgb(") + v.join(",") + ")"
    } catch(e) {
      A.rgbaIE = 1
    }
  }
};
A.fx.height = A.fx.width;

A.RGBA = /#(.)(.)(.)\b|#(..)(..)(..)\b|(\d+)%,(\d+)%,(\d+)%(?:,([\d\.]+))?|(\d+),(\d+),(\d+)(?:,([\d\.]+))?\b/;
A.toRGBA = function(s, v) {
  v = [0, 0, 0, 0];
  s.replace(/\s/g, "").replace(A.RGBA, function(i, a,b,c, f,g,h, l,m,n,o, w,x,y,z) {
    var h = [a+a||f, b+b||g, c+c||h], p = [l, m, n];

    for(i=0; i<3; i++) h[i] = parseInt(h[i], 16), p[i] = Math.round(p[i]*2.55);

    v = [h[0]||p[0]||w||0,  h[1]||p[1]||x||0,  h[2]||p[2]||y||0,  o||z||1]
  });
  return v
};

return A
}();
;
/**
 * User: Travis Smith
 *
 * This is served as a shared service for assisting with mime types.
 */

(function (angular, twc) {
  'use strict';

  /**
   * @ngdoc service
   * @name shared.mimeTypes
   * @description Assists in finding the mime type for a file or URL.
   */
  twc.shared.apps
    .factory('mimeTypes',
      function MimeTypes() {
        /** @namespace MimeTypes */

        /**
         * Available mimeTypes.
         *
         * @private
         * @type {{3g2: string, 3gp: string, aac: string, adp: string, aif: string, aifc: string, aiff: string, apr: string, asf: string, asr: string, asx: string, au: string, avi: string, bmp: string, btif: string, cgm: string, cmx: string, cod: string, djvu: string, dra: string, dts: string, dtshd: string, dvi: string, dwf: string, dwg: string, dxf: string, eol: string, f4v: string, fh: string, fli: string, flv: string, fpx: string, fst: string, fvt: string, g3: string, gif: string, h261: string, h263: string, h264: string, ico: string, ief: string, jfif: string, jpe: string, jpeg: string, jpg: string, jpgv: string, jpm: string, js: string, json: string, ktx: string, lsf: string, lsx: string, lvp: string, m3u: string, m3u8: string, m4v: string, mdi: string, mid: string, mj2: string, mmr: string, mov: string, movie: string, mp2: string, mp3: string, mp4: string, mp4a: string, mpa: string, mpe: string, mpeg: string, mpg: string, mpga: string, mpv2: string, mxu: string, npx: string, oga: string, ogv: string, ogx: string, pbm: string, pcx: string, pgm: string, pic: string, png: string, pnm: string, ppm: string, psd: string, pya: string, pyv: string, qt: string, ra: string, ram: string, ras: string, rgb: string, rip: string, rlc: string, rmi: string, rmp: string, snd: string, sub: string, svg: string, swf: string, tif: string, tiff: string, ts: string, uva: string, uvh: string, uvi: string, uvm: string, uvp: string, uvs: string, uvu: string, uvv: string, viv: string, wav: string, wax: string, wbmp: string, weba: string, webm: string, webp: string, wm: string, wma: string, wmv: string, wmx: string, wvx: string, xbm: string, xif: string, xpm: string, xwd: string}}
         */
        var mimeTypes = {
          '3g2': 'video/3gpp2',
          '3gp': 'video/3gpp',
          aac: 'audio/x-aac',
          adp: 'audio/adpcm',
          aif: 'audio/x-aiff',
          aifc: 'audio/x-aiff',
          aiff: 'audio/x-aiff',
          apr: 'application/vndlotus-approach',
          asf: 'video/x-ms-asf',
          asr: 'video/x-ms-asf',
          asx: 'video/x-ms-asf',
          au: 'audio/basic',
          avi: 'video/x-msvideo',
          bmp: 'image/bmp',
          btif: 'image/prsbtif',
          cgm: 'image/cgm',
          cmx: 'image/x-cmx',
          cod: 'image/cis-cod',
          djvu: 'image/vnddjvu',
          dra: 'audio/vnddra',
          dts: 'audio/vnddts',
          dtshd: 'audio/vnddtshd',
          dvi: 'application/x-dvi',
          dwf: 'model/vnddwf',
          dwg: 'image/vnddwg',
          dxf: 'image/vnddxf',
          eol: 'audio/vnddigital-winds',
          f4v: 'video/x-f4v',
          fh: 'image/x-freehand',
          fli: 'video/x-fli',
          flv: 'video/x-flv',
          fpx: 'image/vndfpx',
          fst: 'image/vndfst',
          fvt: 'video/vndfvt',
          g3: 'image/g3fax',
          gif: 'image/gif',
          h261: 'video/h261',
          h263: 'video/h263',
          h264: 'video/h264',
          ico: 'image/x-icon',
          ief: 'image/ief',
          jfif: 'image/pipeg',
          jpe: 'image/jpeg',
          jpeg: 'image/jpeg',
          jpg: 'image/jpeg',
          jpgv: 'video/jpeg',
          jpm: 'video/jpm',
          js: 'application/javascript',
          json: 'application/json',
          ktx: 'image/ktx',
          lsf: 'video/x-la-asf',
          lsx: 'video/x-la-asf',
          lvp: 'audio/vndlucentvoice',
          m3u: 'audio/x-mpegurl',
          m3u8: 'application/vndapplempegurl',
          m4v: 'video/x-m4v',
          mdi: 'image/vndms-modi',
          mid: 'audio/midi',
          mj2: 'video/mj2',
          mmr: 'image/vndfujixeroxedmics-mmr',
          mov: 'video/mp4',
          //mov: 'video/quicktime',
          movie: 'video/x-sgi-movie',
          mp2: 'video/mpeg',
          mp3: 'audio/mpeg',
          mp4: 'video/mp4',
          mp4a: 'audio/mp4',
          mpa: 'video/mpeg',
          mpe: 'video/mpeg',
          mpeg: 'video/mpeg',
          mpg: 'video/mpeg',
          mpga: 'audio/mpeg',
          mpv2: 'video/mpeg',
          mxu: 'video/vndmpegurl',
          npx: 'image/vndnet-fpx',
          oga: 'audio/ogg',
          ogv: 'video/ogg',
          ogx: 'application/ogg',
          pbm: 'image/x-portable-bitmap',
          pcx: 'image/x-pcx',
          pgm: 'image/x-portable-graymap',
          pic: 'image/x-pict',
          png: 'image/png',
          pnm: 'image/x-portable-anymap',
          ppm: 'image/x-portable-pixmap',
          psd: 'image/vndadobephotoshop',
          pya: 'audio/vndms-playreadymediapya',
          pyv: 'video/vndms-playreadymediapyv',
          qt: 'video/quicktime',
          ra: 'audio/x-pn-realaudio',
          ram: 'audio/x-pn-realaudio',
          ras: 'image/x-cmu-raster',
          rgb: 'image/x-rgb',
          rip: 'audio/vndrip',
          rlc: 'image/vndfujixeroxedmics-rlc',
          rmi: 'audio/mid',
          rmp: 'audio/x-pn-realaudio-plugin',
          snd: 'audio/basic',
          sub: 'image/vnddvbsubtitle',
          svg: 'image/svg+xml',
          swf: 'application/x-shockwave-flash',
          tif: 'image/tiff',
          tiff: 'image/tiff',
          ts: 'video/mp2t',
          uva: 'audio/vnddeceaudio',
          uvh: 'video/vnddecehd',
          uvi: 'image/vnddecegraphic',
          uvm: 'video/vnddecemobile',
          uvp: 'video/vnddecepd',
          uvs: 'video/vnddecesd',
          uvu: 'video/vnduvvump4',
          uvv: 'video/vnddecevideo',
          viv: 'video/vndvivo',
          wav: 'audio/x-wav',
          wax: 'audio/x-ms-wax',
          wbmp: 'image/vndwapwbmp',
          weba: 'audio/webm',
          webm: 'video/webm',
          webp: 'image/webp',
          wm: 'video/x-ms-wm',
          wma: 'audio/x-ms-wma',
          wmv: 'video/x-ms-wmv',
          wmx: 'video/x-ms-wmx',
          wvx: 'video/x-ms-wvx',
          xbm: 'image/x-xbitmap',
          xif: 'image/vndxiff',
          xpm: 'image/x-xpixmap',
          xwd: 'image/x-xwindowdump'
        };

        return {
          /**
           * Gets the mime type for a file via filename (A-Za-z0-9-)*\.(A-Za-z0-9)*
           *
           * @todo: We may have to ignore mimetypes for some extensions
           *  (esp mov->video/quicktime) since the html5 player may have problems
           * @see https://github.com/videojs/video.js/issues/423
           *
           * @method
           * @memberof MimeTypes
           *
           * @param {string} filenameOrUrl File.Extension or URL with File.Extension
           */
          getType: function (filenameOrUrl) {
            // get the part after last /, then replace any query and hash part
            filenameOrUrl = filenameOrUrl.split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '');
            filenameOrUrl = filenameOrUrl.split('.');  // separates filename and extension

            return this.getTypeFromExt(filenameOrUrl[1]);
          },

          /**
           * Gets the mime type from an extension.
           *
           * @method
           * @memberof MimeTypes
           *
           * @param {string} ext Extension without period. (e.g., 'mp4').
           * @returns {string} Mime Type.
           */
          getTypeFromExt: function (ext) {
            if (mimeTypes.hasOwnProperty(ext)) {
              return mimeTypes[ext];
            }
            return '';
          }
        };
      });

})(angular, twc);
;
twc.shared.apps.config(['$provide', '$logProvider', function ($provide, $logProvider) {
  $logProvider.debugEnabled(!!(TWC && TWC.Configs && TWC.Configs.debug));
  $provide.decorator('$log',['$delegate', 'twcLogger', function ($delegate, twcLogger) {
    return twcLogger($delegate);
  }]);

  //  $provide.decorator('$exceptionHandler',['$delegate', '$log', function($delegate, $log) {
  //    var exceptionHandler = $log.getInstance('uncaught-exception');
  //    return function(e, cause) {
  //      // We should log uncaught exceptions to the server once dsx provides an end point to log to the server
  //
  //      var payload = {
  //        url: location.href,
  //        agent: navigator.userAgent,
  //        stackTrace: e.stack
  //      };
  //      exceptionHandler.log(e.stack);
  //      exceptionHandler.debug(e.stack);
  //      exceptionHandler.log('An uncaught exception has occurred, twclog.print("error") to review the errors.');
  //    };
  //  }]);
}]);

twc.shared.apps.run(['$rootScope', '$log', function ($rootScope, $log) {
  $rootScope.$log = $log;
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 12/19/13
 * Time: 3:35 PM
 * To change this template use File | Settings | File Templates.
 *
 * MODIFIED Mar 25 by Dan
 * Added ability to group
 */

twc.shared.apps.factory('twcLogger', function () {
  return function ($delegate) {
    var timestamp = new Date();
    var getTime = function () {
      var t = new Date(),
        y = 1900 + t.getYear(),
        m = t.getMonth() + 1;
      return m + '/' + t.getDate() + '/' + y + ' ' + t.getHours() + ':' + t.getMinutes() + ':' + t.getSeconds() + ':' + t.getMilliseconds();
    };
    return {
      getInstance: function (className) {
        className = className ? className : '';
        return {
          log: function () {
            $delegate.log('LOG:  ' + getTime() + ' - ' + className + '::', arguments);
          },
          debug: function () {
            $delegate.debug('DEBUG:  ' + getTime() + ' - ' + className + '::', arguments);
          },
          warn: function () {
            $delegate.log('WARN:  ' + getTime() + ' - ' + className + '::', arguments);
          },
          info: function () {
            $delegate.log('INFO:  ' + getTime() + ' - ' + className + '::', arguments);
          },
          error: function () {
            // We should log uncaught exceptions to the server once dsx provides an end point to log to the server
            var payload = {
              url: location.href,
              agent: navigator.userAgent,
              stackTrace: arguments
            };
            $delegate.debug('ERROR:  ' + getTime() + ' - ' + className + '::', payload);
            TWC.pco.get('twclog').error(getTime() + ' - ' + className + '::', payload);
          },
          group: function () {
            console.group('INFO:  ' + getTime() + ' - ' + className + '::', arguments);
          },
          groupEnd: function () {
            console.groupEnd();
          },
          setClassName: function (name) {
            className = name;
          }
        };
      },
      error: $delegate.error,
      debug: $delegate.debug,
      info: $delegate.info,
      log: $delegate.log,
      warn: $delegate.warn
    };
  };
});
;
/**
 * Created by aparekh on 9/30/14.
 */
twc.shared.apps.value("providerRulesSettings", {
  domains_map : {
    "Facebook": [/facebook.com/],
    "Twitter" : [/twitter.com/],
    "YouTube" : [/youtube.com/],
    "Google+" : [/google.com/],
    "Big Web" : [/www.weather.com/, /twcrb.dev.weather.com/, /adev.weather.com/, /astg.weather.com/, /aprd.weather.com/, /edit.weather.com/],
    "Little Web" : [/m.weather.com/]
  },
  errorMessageAssets: {
    // image: "c9e14a78-9f23-451c-862e-28f40d744b83",
    video: "41ebda0f-6471-423a-85b3-78db6392a4d0"
  }
});
;
/**
 * Created with JetBrains PhpStorm.
 * User: dshenoy
 * Date: 2/4/15
 * Time: 10:47 AM
 * To change this template use File | Settings | File Templates.
 */

twc.shared.apps.factory('providerRulesFactory',
  ['$window', '$log', '$q', 'customEvent', 'MediaAssetFactory', 'providerRulesSettings',
    function ($window, $log, $q, customEvent, MediaAssetFactory, providerRulesSettings) {

      var logger = $log.getInstance('providerRulesFactory');
      var errorMessageVideoReadyEvent = customEvent.getEvent('providerErrorMessageVideoReady');
      var errorMessageVideoReadyEventOverride = customEvent.getEvent('providerErrorMessageVideoReadyOverride');

      var fns = {
    // Get error message video asset data from dsx
    getErrorMessageVideo: function (videoId, videoReadyEvent) {
      MediaAssetFactory.getMediaAssetData({
        id: 'videoData',
        assetId: videoId || providerRulesSettings.errorMessageAssets.video
      })['then'](function (videoData) {
        (videoReadyEvent || errorMessageVideoReadyEvent).resolve(videoData);
      });
    }
  };

      // Get the error message asset once on load of page and resolve event.
      // Unless user wants to customize the error message video, there is no need to get it more than once
      fns.getErrorMessageVideo();

      return {

        /**
         * Based on rules made by the provider of a video, we determine if a video can be played
         * The 'flags' property of the video metadata will tell us on which domains the video can be played
         * @param providerRules
         * @param videoData
         * @returns {boolean}
         */
        providerRulesPassed: function (videoData) {
      var domainAuthorizationFlags = videoData.getFlags() || {};
      var domainAuthorizationFlagKeys = Object.keys(domainAuthorizationFlags);
      var host = $window.location.host;
      // Further determine parent host in case the video player is embedded by third party
      if ($window.location !== $window.parent.location) {
        var splitreferrer = document.referrer.split('/') ;
        // Finding out host of referrer. In case failure to get it, we will assume native host of embed and allow play per PM
        if (splitreferrer.constructor === Array && splitreferrer.length >= 3) {
          host = splitreferrer[2];
        }
      }
      // Loop through each domain such as 'Facebook', 'Big Web' etc.
      for (var i = 0; i < domainAuthorizationFlagKeys.length; i++) {
        // Determine what each domain means - hence 'Big Web' is a list of www.weather.com, astg.weather.com etc.
        // Loop through each possiblity and see if the current location where the video is being played matches with the domain list
        var key = domainAuthorizationFlagKeys[i];
        if (providerRulesSettings.domains_map[key]) {
          for (var j = 0; j < providerRulesSettings.domains_map[key].length; j++) {
            var domain = providerRulesSettings.domains_map[key][j];
            if (host.match(domain)) {
              logger.debug('Determined we are currently in ', key);
              // If there is a match, we will return the authorization rule that the provider has set for that domain
              return domainAuthorizationFlags[key];
            }
          }
        }
      }

      // Per requirements from PM, we will default to play
      logger.debug('Host does not match with any provider rules listing. Defaulting to pass.', host, providerRulesSettings.domains_map);
      return true;
    },
        getErrorMessageAsset: function (assetType, assetIdData) {
      // We return the custom event which carries the data.
      // Once this data is retrieved in the app, we don't want to keep hitting the network
      // hence usage of this custom event
      var localCustomEvent;

      switch (assetType) {
        case 'video':
          if (assetIdData) {
            // Case where user has provided an override for the video id that has the error message
            localCustomEvent = errorMessageVideoReadyEventOverride;
            fns.getErrorMessageVideo(assetIdData.video, errorMessageVideoReadyEventOverride);
          } else {
            localCustomEvent = errorMessageVideoReadyEvent;
          }
          break;

        default:
          localCustomEvent = errorMessageVideoReadyEvent;
          break;
      }

      return localCustomEvent;
    }
      };
    }]);

;
(function(angular, $, TWC) {
  'use strict';

  twc.shared.apps
    .factory('glomoAlertFactoryTurbo', glomoAlertFactoryTurbo);

  glomoAlertFactoryTurbo.$inject = ['twcUtil'];
  function glomoAlertFactoryTurbo(twcUtil) {
    var POLLEN_ALERT_TRIGGER_VALUE = 3,
        POLLEN_SEVERITY = 3;

    var alertFactory = {
      getAlerts: getAlerts
    };

    return alertFactory;

    ////////////////
    function getHighestPollenIndexValue(pollen){
      var maxPollen = 0;
      maxPollen = Math.max(maxPollen, pollen.tree);
      maxPollen = Math.max(maxPollen, pollen.grass);
      maxPollen = Math.max(maxPollen, pollen.weed);
      return maxPollen;
    }
    function getAlerts(bulletins, pollen) {
      var alerts = [];
      twcUtil.each(bulletins, function (bulletin, index) {
        bulletin.severityCode = bulletin.getEventSeverity();
      });
      if (bulletins && bulletins.length > 0) {
        angular.copy(bulletins, alerts);
      }

      if (pollen && pollen.data && getHighestPollenIndexValue(pollen.data) >= POLLEN_ALERT_TRIGGER_VALUE) {
        pollen.severityCode = POLLEN_SEVERITY;

        alerts.push(pollen);
      }

      return alerts;
    }

  }
})(angular, jQuery, TWC);;
twc.shared.apps.filter('safeDisplay',['twcUtil',function (twcUtil) {
  // replace input with default text when empty
  return function (input, textToReplace) {
    if ('isLoading' in this && this.isLoading) {
      return '';
    }
    return (input === 0 || !!input) ? input : (textToReplace || '-');
  };
}])
.filter('twcFilter',['twcUtil',function (twcUtil) {
  return {
    getByProperty: function (name, value, collection) {
      return twcUtil.find(collection, function (item) {
        return item.data ? item.data[name] === value : item[name] === value;
      });
    }
  };
}])
.filter('truncate', function () {
  // Truncate a string.
  // max (integer) - max length of the text, cut to this number of chars
  // tail (string, default: ' …') - add this string to the input string if the string was cut
  return function (value, max, tail) {
    if (!value) { return ''; }

    max = parseInt(max, 10);
    if (!max) { return value; }
    if (value.length <= max) { return value; }

    value = value.substr(0, max);

    return value + (tail || ' …');
  };
})
.filter('appendRandomLoremIpsum', function () {
  // Add some extra text to a string, sufficient to make it long
  // enough to test word wrap or ellipsis-application in an element
  // during development of a module
  var words = ['Lorem', 'ipsum', 'sit', 'amor', 'cetere', 'Carthago', 'delenda', 'est', 'et', 'ad', 'alia'];
  var wordPositions, offsetSeed;

  function getNextNumber(string, min, max) {
    var currentPos, currentCharCode, responseRange;

    if (typeof wordPositions[string] === 'undefined') {
      currentPos = (offsetSeed % string.length);
    } else {
      if (wordPositions[string] >= string.length) {
        currentPos = 0;
      } else {
        currentPos = wordPositions[string];
      }
    }
    wordPositions[string] = currentPos + 1; // increment for next time;
    currentCharCode = string.charCodeAt(currentPos);
    responseRange = max - min;
    return ((currentCharCode % responseRange) + min);
  }

  function getWord(value) {
    return words[getNextNumber(value, 0, words.length)];
  }

  function getWords(value, min, max) {
    var words = ' ', i, howMany = getNextNumber(value, min, max);

    for (i = 0; i < howMany; i++) {
      words += (getWord(value) + ' ');
    }

    return words;
  }

  return function (value, min, max) {
    wordPositions = {};
    offsetSeed = (new Date()).getMinutes();
    value = value || '';
    min = min || 0;
    max = max || 12;
    return value + getWords(value, min, max);
  };
});
;
/**
 * Created with JetBrains PhpStorm.
 * User: ssherwood
 * Date: 12/19/13
 * Time: 2:19 PM
 * To change this template use File | Settings | File Templates.
 */
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module("shared", []);
twc.shared.apps.directive('fromStr',['$log', 'twcPco', function($log, twcPco) {
  'use strict';
  var logger = $log.getInstance('fromStr');
  return {
    replace: false,
    transclude:false,
    link: function(scope, element, attrs) {
      element.bind('click', function(e) {
        var pagename = (twcPco.get('metrics') && twcPco.get('metrics').attributes.pagename);
        var settings = scope.getInstance && scope.getInstance() || scope.settings || {};
        var moduleId;
        /* Having to search for "module_id" in the key name because it will not always be the same.
         * Even though we could name it the same for all page level nodes, articles will not allow it.
         * Articles will pass the machine_name into the instance object as the key name. Drupal will not
         * allow you to have duplicate machine_names.
         */
        for (var key in settings) {
          if (key.indexOf("module_id") > -1) {
            moduleId = (scope.getInstance && scope.getInstance()[key] || settings[key]);
          }
        }

        // If moduleId is still undefined try the attribute moduleId on the fromStr directive
        moduleId = moduleId || attrs.moduleId;

        // Retrieving fromStr attributes from a parent directive scope if exists
        // Specifically the header_savedlocations.directive
        var addlAttrs = scope.fromAttrs || "";
        addlAttrs = addlAttrs ? addlAttrs + "-" : "";
        var linkFromString = addlAttrs + attrs.fromStr;
        var fromString = moduleId ? [pagename,moduleId,linkFromString].join("_") : [pagename,linkFromString].join("_");
        jQuery.cookie("fromStr", fromString,{domain: ".weather.com",path:"/"});

        // Make sure exit links are being tracked by Tealium scode.
        logger.debug(fromString);
      });
    }
  };
}]).run(['customEvent', 'twcPco',function(customEvent, twcPco) {
  customEvent.getEvent('from-string-event').progress(function(e) {
    var pagename = (twcPco.get('metrics') && twcPco.get('metrics').attributes.pagename);
    // The correct way is to pass the settings obj that will have the moduleId for the current module
    // The e.scope will be deprecated soon
    var moduleId =  (e.module_id) ||
      (e.settings && e.settings.module_id) ||
      (e.scope && e.scope.getInstance && e.scope.getInstance().module_id);
    var fromString = [pagename,moduleId, e.fromStr].join("_");
    jQuery.cookie("fromStr", fromString, {domain: ".weather.com",path:"/" });
  });
}]);
;
/**
 * Created by aparekh on 2/3/15.
 */
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.directive('inViewBeacon',['customEvent', 'twcUtil', '$window', function (customEvent, twcUtil, $window) {
  'use strict';

  return {
    restrict: 'A',
    replace: false,
    transclude:false,
    link: function (scope, element, attrs) {
      var adPos = element.attr('data-beacon-name');
      var width = parseFloat(element.attr('data-width')) || 1;
      var height = parseFloat(element.attr('data-height')) || 0.5;
      var elementViewed = false;
      var checkInView = function () {
        // check to see if the element is in viewport
        if (TWC.PcoUtils.isInViewPort(element)) {
          customEvent.getEvent('track-string-event').notify({module_id: 'beacon', trackStr: adPos});
          elementViewed = true;
        }
        return elementViewed;
      };

      // Attaching debounced scroll event from twc.events.run.js
      angular.element($window).bind('ScreenScrolled ScreenResizeEnd1Sec',function (e) {
        // if the element has already been viewed, then turn off the event
        elementViewed && angular.element(this).off(e);
        // if the element has not yet been viewed, then check if its in view now..and if it is, then turn off the event.
        !elementViewed && checkInView() && angular.element(this).off(e);
      });

      customEvent.getEvent('slotRefreshReady').done(function () {
        !elementViewed && checkInView();
      });
    }

  };

}]);
;
/*
 *	jQuery dotdotdot 1.6.16
 *
 *	Copyright (c) Fred Heusschen
 *	www.frebsite.nl
 *
 *	Plugin website:
 *	dotdotdot.frebsite.nl
 *
 *	Dual licensed under the MIT and GPL licenses.
 *	http://en.wikipedia.org/wiki/MIT_License
 *	http://en.wikipedia.org/wiki/GNU_General_Public_License
 */
!function(t,e){function n(t,e,n){var r=t.children(),o=!1;t.empty();for(var i=0,d=r.length;d>i;i++){var l=r.eq(i);if(t.append(l),n&&t.append(n),a(t,e)){l.remove(),o=!0;break}n&&n.detach()}return o}function r(e,n,i,d,l){var s=!1,c="table, thead, tbody, tfoot, tr, col, colgroup, object, embed, param, ol, ul, dl, blockquote, select, optgroup, option, textarea, script, style",u="script, .dotdotdot-keep";return e.contents().detach().each(function(){var f=this,h=t(f);if("undefined"==typeof f||3==f.nodeType&&0==t.trim(f.data).length)return!0;if(h.is(u))e.append(h);else{if(s)return!0;e.append(h),l&&e[e.is(c)?"after":"append"](l),a(i,d)&&(s=3==f.nodeType?o(h,n,i,d,l):r(h,n,i,d,l),s||(h.detach(),s=!0)),s||l&&l.detach()}}),s}function o(e,n,r,o,d){var c=e[0];if(!c)return!1;var f=s(c),h=-1!==f.indexOf(" ")?" ":"　",p="letter"==o.wrap?"":h,g=f.split(p),v=-1,w=-1,b=0,y=g.length-1;for(o.fallbackToLetter&&0==b&&0==y&&(p="",g=f.split(p),y=g.length-1);y>=b&&(0!=b||0!=y);){var m=Math.floor((b+y)/2);if(m==w)break;w=m,l(c,g.slice(0,w+1).join(p)+o.ellipsis),a(r,o)?(y=w,o.fallbackToLetter&&0==b&&0==y&&(p="",g=g[0].split(p),v=-1,w=-1,b=0,y=g.length-1)):(v=w,b=w)}if(-1==v||1==g.length&&0==g[0].length){var x=e.parent();e.detach();var T=d&&d.closest(x).length?d.length:0;x.contents().length>T?c=u(x.contents().eq(-1-T),n):(c=u(x,n,!0),T||x.detach()),c&&(f=i(s(c),o),l(c,f),T&&d&&t(c).parent().append(d))}else f=i(g.slice(0,v+1).join(p),o),l(c,f);return!0}function a(t,e){return t.innerHeight()>e.maxHeight}function i(e,n){for(;t.inArray(e.slice(-1),n.lastCharacter.remove)>-1;)e=e.slice(0,-1);return t.inArray(e.slice(-1),n.lastCharacter.noEllipsis)<0&&(e+=n.ellipsis),e}function d(t){return{width:t.innerWidth(),height:t.innerHeight()}}function l(t,e){t.innerText?t.innerText=e:t.nodeValue?t.nodeValue=e:t.textContent&&(t.textContent=e)}function s(t){return t.innerText?t.innerText:t.nodeValue?t.nodeValue:t.textContent?t.textContent:""}function c(t){do t=t.previousSibling;while(t&&1!==t.nodeType&&3!==t.nodeType);return t}function u(e,n,r){var o,a=e&&e[0];if(a){if(!r){if(3===a.nodeType)return a;if(t.trim(e.text()))return u(e.contents().last(),n)}for(o=c(a);!o;){if(e=e.parent(),e.is(n)||!e.length)return!1;o=c(e[0])}if(o)return u(t(o),n)}return!1}function f(e,n){return e?"string"==typeof e?(e=t(e,n),e.length?e:!1):e.jquery?e:!1:!1}function h(t){for(var e=t.innerHeight(),n=["paddingTop","paddingBottom"],r=0,o=n.length;o>r;r++){var a=parseInt(t.css(n[r]),10);isNaN(a)&&(a=0),e-=a}return e}if(!t.fn.dotdotdot){t.fn.dotdotdot=function(e){if(0==this.length)return t.fn.dotdotdot.debug('No element found for "'+this.selector+'".'),this;if(this.length>1)return this.each(function(){t(this).dotdotdot(e)});var o=this;o.data("dotdotdot")&&o.trigger("destroy.dot"),o.data("dotdotdot-style",o.attr("style")||""),o.css("word-wrap","break-word"),"nowrap"===o.css("white-space")&&o.css("white-space","normal"),o.bind_events=function(){return o.bind("update.dot",function(e,d){e.preventDefault(),e.stopPropagation(),l.maxHeight="number"==typeof l.height?l.height:h(o),l.maxHeight+=l.tolerance,"undefined"!=typeof d&&(("string"==typeof d||d instanceof HTMLElement)&&(d=t("<div />").append(d).contents()),d instanceof t&&(i=d)),g=o.wrapInner('<div class="dotdotdot" />').children(),g.contents().detach().end().append(i.clone(!0)).find("br").replaceWith("  <br />  ").end().css({height:"auto",width:"auto",border:"none",padding:0,margin:0});var c=!1,u=!1;return s.afterElement&&(c=s.afterElement.clone(!0),c.show(),s.afterElement.detach()),a(g,l)&&(u="children"==l.wrap?n(g,l,c):r(g,o,g,l,c)),g.replaceWith(g.contents()),g=null,t.isFunction(l.callback)&&l.callback.call(o[0],u,i),s.isTruncated=u,u}).bind("isTruncated.dot",function(t,e){return t.preventDefault(),t.stopPropagation(),"function"==typeof e&&e.call(o[0],s.isTruncated),s.isTruncated}).bind("originalContent.dot",function(t,e){return t.preventDefault(),t.stopPropagation(),"function"==typeof e&&e.call(o[0],i),i}).bind("destroy.dot",function(t){t.preventDefault(),t.stopPropagation(),o.unwatch().unbind_events().contents().detach().end().append(i).attr("style",o.data("dotdotdot-style")||"").data("dotdotdot",!1)}),o},o.unbind_events=function(){return o.unbind(".dot"),o},o.watch=function(){if(o.unwatch(),"window"==l.watch){var e=t(window),n=e.width(),r=e.height();e.bind("resize.dot"+s.dotId,function(){n==e.width()&&r==e.height()&&l.windowResizeFix||(n=e.width(),r=e.height(),u&&clearInterval(u),u=setTimeout(function(){o.trigger("update.dot")},100))})}else c=d(o),u=setInterval(function(){if(o.is(":visible")){var t=d(o);(c.width!=t.width||c.height!=t.height)&&(o.trigger("update.dot"),c=t)}},500);return o},o.unwatch=function(){return t(window).unbind("resize.dot"+s.dotId),u&&clearInterval(u),o};var i=o.contents(),l=t.extend(!0,{},t.fn.dotdotdot.defaults,e),s={},c={},u=null,g=null;return l.lastCharacter.remove instanceof Array||(l.lastCharacter.remove=t.fn.dotdotdot.defaultArrays.lastCharacter.remove),l.lastCharacter.noEllipsis instanceof Array||(l.lastCharacter.noEllipsis=t.fn.dotdotdot.defaultArrays.lastCharacter.noEllipsis),s.afterElement=f(l.after,o),s.isTruncated=!1,s.dotId=p++,o.data("dotdotdot",!0).bind_events().trigger("update.dot"),l.watch&&o.watch(),o},t.fn.dotdotdot.defaults={ellipsis:"... ",wrap:"word",fallbackToLetter:!0,lastCharacter:{},tolerance:0,callback:null,after:null,height:null,watch:!1,windowResizeFix:!0},t.fn.dotdotdot.defaultArrays={lastCharacter:{remove:[" ","　",",",";",".","!","?"],noEllipsis:[]}},t.fn.dotdotdot.debug=function(){};var p=1,g=t.fn.html;t.fn.html=function(n){return n!=e&&!t.isFunction(n)&&this.data("dotdotdot")?this.trigger("update",[n]):g.apply(this,arguments)};var v=t.fn.text;t.fn.text=function(n){return n!=e&&!t.isFunction(n)&&this.data("dotdotdot")?(n=t("<div />").text(n).html(),this.trigger("update",[n])):v.apply(this,arguments)}}}(jQuery);;
/**
 * User: Cord Hamrick
 * Date: 9/8/2014
 *
 * This directive will execute the jQuery dotdotdot plugin
 * on the associated element, with the config options being
 * provided by the associated data-ellipsis attributes.
 *
 * ** If applying directly on element and it contains data-ng-bind use twc-ellipsis-text in-place of that...
 *
 * Options provided by attributes in the DOM element:
 *  twc-ellipsis-text      = "{{ 'text to wrap/truncate to the available space' }}"
 *  twc-ellipsis-tail      = "… " (normally, an ellipsis character and a space)
 *  twc-ellipsis-watch     = "false|window" (re-checks the truncation on window resize)
 *  twc-ellipsis-wrap      = "word|letter|children" (how to wrap)
 *  twc-ellipsis-after     = null|jQuery-selector-of-element-after-this-one-to-append-after-tail
 *  twc-ellipsis-height    = {integer} optional max-height (if null, the height will be measured dynamically)
 *  twc-ellipsis-tolerance = 0 (permitted deviation for the height-option)
 *  twc-ellipsis-end-remove-chars   = [' ', ',' ';'] (array of chars to remove from end if truncating)
 *  twc-ellipsis-end-no-tail-chars  = [] (Don't add ellipsis if this array contains the last char of the truncated text.)
 *  twc-ellipsis-fallback-to-letter = false|true (wrap-option falls back to 'letter' for long words)
 */

/* global twc */
/*jshint -W065 */

twc.shared.apps.directive('twcEllipsis', ['twcUtil', '$timeout', function (twcUtil, $timeout) {
  'use strict';

  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      // toggleTruncationClass toggles css class on the
      // element from '.is-truncated' to '.not-truncated'.
      function toggleTruncationClass(isTruncated, origContent) {
        if (isTruncated) {
          element.addClass('is-truncated').removeClass('not-truncated');
        } else {
          element.addClass('not-truncated').removeClass('is-truncated');
        }
      }

      // configuration defaults may be overridden in directive attributes
      attrs.twcEllipsisText      = attrs.twcEllipsisText   || '';
      attrs.twcEllipsisTail      = attrs.twcEllipsisTail   || '… ';
      attrs.twcEllipsisWatch     = attrs.twcEllipsisWatch  || 'window';
      attrs.twcEllipsisWrap      = attrs.twcEllipsisWrap   || 'letter';
      attrs.twcEllipsisAfter     = attrs.twcEllipsisAfter  || null;
      attrs.twcEllipsisTolerance = attrs.twcEllipsisTolerance || 0;
      attrs.twcEllipsisHeight    = Number(attrs.twcEllipsisHeight) || null;

      attrs.twcEllipsisEndRemoveChars   = attrs.twcEllipsisEndRemoveChars   || [' ', ',', ';', '.', '!', '?'];
      attrs.twcEllipsisEndNoTailChars   = attrs.twcEllipsisEndNoTailChars   || [];
      attrs.twcEllipsisFallbackToLetter = attrs.twcEllipsisFallbackToLetter || true;

      function doDotDotDot() {
      scope.$evalAsync(function () {
        var afterElement;
        var objOptions = {
          ellipsis:  attrs.twcEllipsisTail,
          watch:     attrs.twcEllipsisWatch,
          wrap:      attrs.twcEllipsisWrap,
          height:    attrs.twcEllipsisHeight,
          tolerance: attrs.twcEllipsisTolerance,
          callback:  toggleTruncationClass,

          lastCharacter: {
            remove:     attrs.twcEllipsisEndRemoveChars,
            noEllipsis: attrs.twcEllipsisEndNoTailChars
          },

          fallbackToLetter: attrs.twcEllipsisFallbackToLetter
        };

        element.html(attrs.twcEllipsisText);

        if (attrs.twcEllipsisAfter) {
          afterElement = element.next(attrs.twcEllipsisAfter).remove();
        }
        if (afterElement && afterElement.length) {
          objOptions['after'] = attrs.twcEllipsisAfter;
          element.append(afterElement);
        }

        element.dotdotdot(objOptions);
      });
    }

      attrs.$observe('twcEllipsisText', function () {
        $timeout(doDotDotDot, 0);
      });

      doDotDotDot();
    }
  };
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/10/13
 * Time: 3:45 PM
 * To change this template use File | Settings | File Templates.
 */
twc.shared.apps
  .config(['twcConfigProvider',function (twcConfigProvider) {
    twcConfigProvider.add({pco:{
      models: {
        savedLocation: 'PcoSavedLocationModel',
        recentSearchLocation: 'PcoSavedLocationModel',
        wxdMORecordModel: 'WxdMORecordModelClass'

      },

      createFullUserLocationList: function (user) {
        return (user.getSavedLocations() || []).concat(user.getRecentSearchLocations() || []);
      }
    }});
  }])
  .run(['pcoUser',function (pcoUser) {
    window.user = pcoUser;
  }]);
;
/*
 Formats the presentation name of WxdLoc and XWebLoc models from display

 Ex: <div data-ng-bind-template="{{location | locationName}}"></div>

 */
twc.shared.apps.filter('glomoLocationName',['$injector', 'twcUtil', 'twcConstant', 'pcoUser', function($injector, twcUtil, twcConstant, pcoUser) {
  var XwebModelClass = $injector.has('XwebWebLocModelClass') && $injector.get('XwebWebLocModelClass');
  /*
   Convert the given location object to an XWebLocModel.
   @param loc - the location object.
   @return object - XWebLocModel if conversion is successful. Null otherwise.
   */
  function toXWebLocModel(loc) {
    var xwebLoc = null;
    switch( loc.className ) {
      case 'XwebWebLocModelClass' :
        xwebLoc = loc;
        break;
      case 'WxdLocModelClass' :
        xwebLoc = new XwebModelClass({
          'presName' : loc.getPresName() || loc.prsntNm,
          'lat' :     loc.getLatitude() || loc.lat,
          'lng' :     loc.getLongitude() || loc.long,
          'name' :    (loc.getAddress) ? loc.getAddress() + ' ' + loc.getCity() + ', ' + loc.getStateCode() : loc.getCity() + ', ' + loc.getStateCode() + ', ' +  loc.getCountry(),
          'key':      loc.getFullLocId() || loc.loc,
          'locId':    loc.getLocId() || loc.locId,
          'locType':  loc.getLocType() || loc.locType,
          'cntryCd':  loc.getCountryCode() || loc.cntryCd,
          '_country': loc.getCountry() || loc._country,
          'stCd':     loc.getStateCode() || loc.stCd,
          'stNm':     loc.getState() || loc.stNm,
          'cityNm' :  twcUtil.capitalize(loc.getCity() || loc.cityNm, true),
          'bigCity':  false,
          'nickname': '',
          'recentSearch': false,
          'addr': (loc.getAddress && loc.getAddress())
        }, 'XwebWebLocModelClass');
        break;
    }

    return xwebLoc;
  }

  /*
   Formats the TWC Location name for display.
   @param location - XWebLoc or WxdLoc data model
   @return string - Formatted location name

   TODO: Deprecate XwebLocModelClass.getFormattedName method. Presentation logic should not be in the data model.
   */
  function getFormattedName(loc) {
    if( twcUtil.isEmpty(loc) ) {
      return null;
    }
    var name,
      locale = pcoUser.getLocale(),
      defaultCountryCodeForLocale = (twcConstant.localeToCountry[locale] || 'US').toUpperCase(),
      location = loc.prsntNm ? loc : toXWebLocModel(loc),
      locCountryCode = loc.cntryCd || location.getCountryCode(),
      stateCd = loc.stCd || location.getStateCode(),
      presName = loc.prsntNm || location.data.presName,
      nickname = loc.nickname;
    // TODO
    // ADDING A SPECIAL CHECK FOR BURDA

    // REMOVE AFTER DSX ADDS RULES FOR PRESENTATION NAME
    if( locale !== 'en_US' && defaultCountryCodeForLocale === locCountryCode){
      var nameArr = presName.split(',');
      name = nameArr[0] + ", " + stateCd;
    }else{
      name = presName;
    }
    return nickname || name;
  }

  return getFormattedName;

}]);;
/**
 * User: Jeff Lu
 * Date: 1/18/2014
 * Time: 9:41
 */

twc.shared.apps.constant('twcConstant', {
  locTypes: {
    Region: 1003,
    State: 1001,
    Country: 1000,
    Cities: 1,
    Golf: 5,
    Airports: 9,
    Ski: 11,
    Outdoor: 13,
    Zips: 4,
    Parks: 19,
    Lakes: 21
  },
  
  localeToCountry : {
    "ar_AE" : "ae",
    "bn_BD" : "bd",
    "ca_ES" : "sp",
    "cs_CZ" : "ez",
    "da_DK" : "da",
    "de_DE" : "gm",
    "el_GR" : "gr",
    "en_CA" : "ca",
    "en_GB" : "uk",
    "en_US" : "us",
    "es_US" : "us",
    "fa_IR" : "ir",
    "fi_FI" : "fi",
    "fr_CA" : "ca",
    "fr_FR" : "fr",
    "he_IL" : "is",
    "hi_IN" : "in",
    "hr_HR" : "hr",
    "hu_HU" : "hu",
    "in_ID" : "id",
    "it_IT" : "it",
    "iw_IL" : "is",
    "ja_JP" : "ja",
    "kk_KZ" : "kz",
    "ko_KR" : "ks",
    "ms_MY" : "my",
    "nl_NL" : "nl",
    "no_NO" : "no",
    "pl_PL" : "pl",
    "pt_BR" : "br",
    "ro_RO" : "ro",
    "ru_RU" : "rs",
    "sk_SK" : "lo",
    "sv_SE" : "sw",
    "th_TH" : "th",
    "tl_PH" : "ph",
    "tr_TR" : "tu",
    "uk_UA" : "up",
    "ur_PK" : "pk",
    "vi_VN" : "vm",
    "zh_CN" : "cn",
    "zh_HK" : "hk"
  },

  statesCodesToNames : [
    { name: 'ALABAMA', abbreviation: 'AL'},
    { name: 'ALASKA', abbreviation: 'AK'},
    { name: 'AMERICAN SAMOA', abbreviation: 'AS'},
    { name: 'ARIZONA', abbreviation: 'AZ'},
    { name: 'ARKANSAS', abbreviation: 'AR'},
    { name: 'CALIFORNIA', abbreviation: 'CA'},
    { name: 'COLORADO', abbreviation: 'CO'},
    { name: 'CONNECTICUT', abbreviation: 'CT'},
    { name: 'DELAWARE', abbreviation: 'DE'},
    { name: 'DISTRICT OF COLUMBIA', abbreviation: 'DC'},
    { name: 'FEDERATED STATES OF MICRONESIA', abbreviation: 'FM'},
    { name: 'FLORIDA', abbreviation: 'FL'},
    { name: 'GEORGIA', abbreviation: 'GA'},
    { name: 'GUAM', abbreviation: 'GU'},
    { name: 'HAWAII', abbreviation: 'HI'},
    { name: 'IDAHO', abbreviation: 'ID'},
    { name: 'ILLINOIS', abbreviation: 'IL'},
    { name: 'INDIANA', abbreviation: 'IN'},
    { name: 'IOWA', abbreviation: 'IA'},
    { name: 'KANSAS', abbreviation: 'KS'},
    { name: 'KENTUCKY', abbreviation: 'KY'},
    { name: 'LOUISIANA', abbreviation: 'LA'},
    { name: 'MAINE', abbreviation: 'ME'},
    { name: 'MARSHALL ISLANDS', abbreviation: 'MH'},
    { name: 'MARYLAND', abbreviation: 'MD'},
    { name: 'MASSACHUSETTS', abbreviation: 'MA'},
    { name: 'MICHIGAN', abbreviation: 'MI'},
    { name: 'MINNESOTA', abbreviation: 'MN'},
    { name: 'MISSISSIPPI', abbreviation: 'MS'},
    { name: 'MISSOURI', abbreviation: 'MO'},
    { name: 'MONTANA', abbreviation: 'MT'},
    { name: 'NEBRASKA', abbreviation: 'NE'},
    { name: 'NEVADA', abbreviation: 'NV'},
    { name: 'NEW HAMPSHIRE', abbreviation: 'NH'},
    { name: 'NEW JERSEY', abbreviation: 'NJ'},
    { name: 'NEW MEXICO', abbreviation: 'NM'},
    { name: 'NEW YORK', abbreviation: 'NY'},
    { name: 'NORTH CAROLINA', abbreviation: 'NC'},
    { name: 'NORTH DAKOTA', abbreviation: 'ND'},
    { name: 'NORTHERN MARIANA ISLANDS', abbreviation: 'MP'},
    { name: 'OHIO', abbreviation: 'OH'},
    { name: 'OKLAHOMA', abbreviation: 'OK'},
    { name: 'OREGON', abbreviation: 'OR'},
    { name: 'PALAU', abbreviation: 'PW'},
    { name: 'PENNSYLVANIA', abbreviation: 'PA'},
    { name: 'PUERTO RICO', abbreviation: 'PR'},
    { name: 'RHODE ISLAND', abbreviation: 'RI'},
    { name: 'SOUTH CAROLINA', abbreviation: 'SC'},
    { name: 'SOUTH DAKOTA', abbreviation: 'SD'},
    { name: 'TENNESSEE', abbreviation: 'TN'},
    { name: 'TEXAS', abbreviation: 'TX'},
    { name: 'UTAH', abbreviation: 'UT'},
    { name: 'VERMONT', abbreviation: 'VT'},
    { name: 'VIRGIN ISLANDS', abbreviation: 'VI'},
    { name: 'VIRGINIA', abbreviation: 'VA'},
    { name: 'WASHINGTON', abbreviation: 'WA'},
    { name: 'WEST VIRGINIA', abbreviation: 'WV'},
    { name: 'WISCONSIN', abbreviation: 'WI'},
    { name: 'WYOMING', abbreviation: 'WY' }
  ],
  ascii: {
    TAB: 9,
    CR: 13,
    ESC: 27,
    DOWN: 40,
    UP: 38,
    L: 37,
    R: 39,
    DEL: 127,
    BS: 8
  },
  pageUrl: {
    "hdr": {"page": "/weather/today/l/", "enhance": "/search/enhancedlocalsearch?where="},
    "video": {"page": "/video/", "enhance": "/search/enhancedlocalsearch?where="},
    "ap-main": {"page": "/health/aches-pains/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "ap-fcst": {"page": "/health/aches-pains/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "pollen-main": {"page": "/health/pollen/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "pollen-fcst": {"page": "/health/pollen/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "hg-main": {"page": "/home-garden/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "hg-fcst": {"page": "/home-garden/forecast/", "enhance": "/search/enhancedlocalsearch?where="},
    "fish-main": {"page": "/outlook/recreation/outdoors/fishing/", "enhance": "/search/enhancedlocalsearch?where="},
    "fish-fcst": {"page": "/outlook/recreation/outdoors/fishing/", "enhance": "/search/enhancedlocalsearch?where="},
    "ski-main": {"page": "/sports-rec/ski/forecast/", "enhance": "/sports-rec/ski/results?where="},
    "ski-fcst": {"page": "/sports-rec/ski/forecast/", "enhance": "/sports-rec/ski/results?where="},
    "hp-countdown": {"page": "dynamic", "enhance": "/search/enhancedlocalsearch?where="},
    "title_enhanced": {"page": "dynamic", "enhance": "/search/enhancedlocalsearch?where="},
    "vertSearch": {"page": "dynamic", "enhance": "/search/enhancedlocalsearch?where="},
    "tornado-central" : {"page": "/storms/tornado/forecast/" }
  },
  socialMedia: {
    facebook: {icon: 'facebook', title: 'Facebook Recommend'},
    twitter: {icon: 'twitter', title: 'Twitter Tweet'},
    googleplus: {icon: 'google-plus', title: 'Google Plus'},
    reddit: {icon: 'reddit', title: 'Post to Reddit'},
    pinterest: {icon: 'pinterest', title: 'Pinterest Pin'},
    email: {icon: 'email', title: 'Email Shares'},
    qq: {icon: 'qzone', title: 'QIt'},
    sina: {icon: 'sina-weibo', title: 'Sina'}
  },
  microdata: {
    // TODO: need to add all supported schema
    url: 'http://schema.org/',
    schema: {
      organization: {name: 'Organization'},
      video: {name: 'VideoObject'},
      image: {name: 'ImageObject'},
      article: {name: 'Article'}
    }
  },
  hurricaneSeason: {
    start: "May 15",
    end: "November 30"
  },
  assetsUrl: "//s.w-x.co/",
  oldAssetsIDomain : "//i.imwx.com/",
  oldAssetsImageDomain : "//i.imwx.com/",
  sina: {icon: 'sina-weibo', title: 'Sina'},
  LogoTWC: {
    logo_100x100: 'TWC_logo_100x100.gif',
    white_logo: 'twc-white.png'
  },
  profile: {
    host: "profile.weather.com",
    version: "",
    protocol: "https"
  },
  search: {
    LOCATION_CHANGED_EVENT: 'search_location-changed',
    ENHANCE_HANDLER: 'Enhance',
    SKI_ENHANCE_HANDLER: 'SkiHandler',
    LANDING_PAGE_HANDLER: 'LandingPage'
  }
});

;
/**
 * Author: ksankaran (Velu)
 * Date: 11/13/13
 * Time: 11:10 AM
 * Comments:
 */

twc.shared.apps.factory('Set',['TwcClass', function (TwcClass) {
  return TwcClass.extend({
    construct: function () {
      this.setMap = {};
    },

    add: function (data) {
      var key = data && data.toString().replace(/ /g, '');
      if (key && !this.setMap[key]) {
        this.setMap[key] = data;
      }
    },

    getAll: function () {
      var array = [];
      angular.forEach(this.setMap, function (value, key) {
        array.push(key);
      });
      return array;
    },

    hasKey: function (key) {
      return (key in this.setMap);
    }
  });
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/9/13
 * Time: 12:36 PM
 * To change this template use File | Settings | File Templates.
 */
(function (root) {
  twc.shared.apps
    .factory('TwcClass', function () {
      return root.TwcClass;
    });
}(window.TWC));
;
/**
 * Author: ksankaran (Velu)
 * Date: 11/12/13
 * Time: 2:12 PM
 * Comments:
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('WxdMORecordModelClass',['RecordModel' ,'$injector','dsxModelUtils',function(RecordModel ,$injector,dsxModelUtils){
  var pcoUser = $injector.get('pcoUser');
  return RecordModel.extend({
    recordType: 'MORecord',

    /**
     * Temperature fahrenheit or celsius, get temp by passing unit or by user preference
     * @param unit
     * @returns {String}  Ex: F
     */
    getTemp: function(unit) {
      unit = unit || this.getUser().getTempUnit();
      return this._get('tmp'+unit);
    },

    /**
     * Temperature fahrenheit or celsius, get temp by passing unit or by user preference
     * @returns {String}  Ex: F
     */
    getTempUnit: function() {
      return this.getUser().getTempUnit();
    },

    /**
     * Get user object from pco
     * @returns {Object} Pco user Object
     */
    getUser: function() {
      return pcoUser;
    },

    /**
     * Get if location is currently Day or Night
     * @returns {String} D = day, N = night, X = missing
     */
    getDayNight: function() {
      return this._get('dyNght');
    },

    /**
     * Weather description for period
     * @returns {String}  Ex: Cloudy (Range: 257 phrases)
     */
    getWeatherDescription: function() {
      return this._get('wx');
    },

    /**
     * sky code (icon) for current period. Daily is 24 hours, Daypart 12 or 24 hours, Hourly is 1 hour, observations current time
     * @returns {String}  Ex: 19 (Range: 0 - 48)
     */
    getSkyCode: function() {
      return this._get('sky');
    },

    /**
     * sky code extended (icon) for current period.
     * @returns {String}  Ex: 3200
     */
    getSkyCodeExtended: function() {
      return this._get('iconExt');
    },

    /**
     * Get observation date
     * @returns {String}  Ex: Sep 26
     */
    getObsDate: function() {
      return this._get('locObsDay');
    },

    /**
     * Get observation time based on client browser
     * @returns {String}  Ex. 10:20am EDT
     */
    getObsTime: function() {
      return this._get('locObsTm');
    },

    /**
     * Get observation GMT time
     * @returns {String}
     */
    getObsGmt: function() {
      return this._get('obsTmGmt');
    },

    /**
     * Get feels like index in fahrenheit or celsius based on user preference
     * @returns {String}  Ex: 79°F
     */
    getFeelsLike: function() {
      return this._get('flsLkIdx'+this.getUser().getTempUnit());
    },

    /**
     * Maximum temperature for the last 24 hours in fahrenheit or celsius based on user preference
     * @returns {String}  Ex: 99°F
     */
    getTodayHi: function() {
      return this._get('tmpMx24'+this.getUser().getTempUnit());
    },

    /**
     * Minuimum temperature for the last 24 hours in fahrenheit or celsius based on user perference
     * @returns {String }  Ex: 69°F
     */
    getTodayLo: function() {
      return this._get('tmpMn24'+this.getUser().getTempUnit());
    },

    /**
     * Precipitation for 24 hour period in inches
     * @returns {String}  Ex: 0.05
     */
    getPrecip24: function() {
      return dsxModelUtils.getPrecipValue(this,'prcp24');
    },

    /**
     * Precipitation amount within last 3 to 6 hours
     * @returns {String}  Ex: 0.08
     */
    getPrecip3_6: function() {
      return dsxModelUtils.getPrecipValue(this,'prcp3_6hr');
    },

    /**
     * Precipitation for the hour
     * @returns {String}  Ex: 0.50
     */
    getPrecipHour: function() {
      return dsxModelUtils.getPrecipValue(this,'prcpHr');
    },

    /**
     * Precipitation for Last 7 Days in inches or millimeters
     * @returns {String}  Ex: 0.05
     */
    getPrecipLast7Days: function() {
      return dsxModelUtils.getPrecipValue(this,'prcp7Dy');
    },

    /**
     * Precipitation total for the Month in inches - Begins first day of the month 12 01 local time
     * @returns {String}  Ex: 15.02
     */
    getPrecipMonth: function() {
      return dsxModelUtils.getPrecipValue(this,'prcpMTD');
    },

    /**
     * Precipitation total for the Year in inches - Begins January 1 at 12 01 local time
     * @returns {String}  Ex: 68.03
     */
    getPrecipYear: function() {
      return dsxModelUtils.getPrecipValue(this,'prcpYr');
    },

    /**
     * Snow Depth - in inches on the ground when record type is METAR, snow accumulation for the last 24 hours when record type is TECCI
     * @returns {String}  Ex: 12.0
     */
    getSnowDepth: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwDep');
    },

    /**
     * Snow increasing in inches per hour when the record type is METAR, snow accumulation for the last hour in inches when the record type is TECCI
     * @returns {String}  Ex: 12.0 (Range: 0 - 15)
     */
    getSnowIncrease: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwIncr');
    },

    /**
     * Total snow accumulation in inches for the current storm when record type is METAR, snow accumulation in inches for the last 6 hours when record type is TECCI
     * @returns {String}  Ex: 130.0 (Range: 0 - 300)
     */
    getSnowTotal: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwTot');
    },

    /**
     * Snow total Month To Date in inches - begins first day of the month at 0000Z GMT
     * @returns {String}  Ex: 39.0 (Range: 0 to 999.9 - frequently null)
     */
    getSnowMTD: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwMTD');
    },

    /**
     * Snow total for the season in inches - begins July 1 at 0000Z, ends June 30, 2359Z GMT
     * @returns {String}  EX: 155.0 (Range: 0 to 9999.9 - frequently null)
     */
    getSnowSeason: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwSsn');
    },

    /**
     * Snow total yearly in inches - begins January 1, 0000Z GMT
     * @returns {String}  366.9 (Range: 0 to 9999.9 - frequently null)
     */
    getSnowByYear: function() {
      return dsxModelUtils.getAccumulationValue(this,'snwYr');
    },

    /**
     * Sunrise in local apparent time of location
     * @returns {String}  Ex: 06 50 00 am
     */
    getSunrise: function() {
      return this._get('sunrise');
    },

    /**
     * Sunset in local apparent time of location
     * @returns {String}  Ex: 06 30 00 pm
     */
    getSunset: function() {
      return this._get('sunset');
    },

    /**
     * Sunrise in ISO format
     * @returns {String}  Ex: 2014-02-06T01:14:00.000Z
     */
    getSunriseISO: function() {
      return this._get('sunriseISO');
    },

    /**
     * Sunset in ISO format
     * @returns {String}   Ex: 2014-02-06T01:14:00.000Z
     */
    getSunsetISO: function() {
      return this._get('sunsetISO');
    },

    /**
     * Sunrise in ISO format
     * @returns {String}  Ex: 2014-02-06T01:14:00.000Z
     */
    getSunriseISOLocal: function() {
      return this._get('_sunriseISOLocal');
    },

    /**
     * Sunset in ISO format
     * @returns {String}   Ex: 2014-02-06T01:14:00.000Z
     */
    getSunsetISOLocal: function() {
      return this._get('_sunsetISOLocal');
    },


    /**
     * Wind direction in text (ascii)
     * @returns {String}  Ex: NE (Range: N , NNE , NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW, CALM, VAR)
     */
    getWindDirection: function() {
      return this._get('wDirAsc');
    },

    /**
     * Wind direction in degrees
     * @returns {String}  Ex: 45 (Range: 0 - 359)
     */
    getWindDirectionDegrees: function() {
      return this._get('wDir');
    },

    /**
     * Wind gust in miles or Kilometers per hour
     * @returns {String}  Ex: 20
     */
    getWindGust: function() {
      var pLocale = ((TWC && TWC.Configs && TWC.Configs.dsx && TWC.Configs.dsx.locale) || (TWC && TWC.Titan && TWC.Titan.locale));
      if(pLocale && pLocale === "en_GB") {
        return this._get('wGstM');
      }
      return this._get('wGst'+this.getUser().getSpeedUnit());
    },

    /**
     * Wind speed in miles or kilometers per hour
     * @returns {String}  Ex: 20
     */
    getWindSpeed: function() {
      var pLocale = ((TWC && TWC.Configs && TWC.Configs.dsx && TWC.Configs.dsx.locale) || (TWC && TWC.Titan && TWC.Titan.locale));
      if(pLocale && pLocale === "en_GB") {
        return this._get('wSpdM');
      }
      return this._get('wSpd'+this.getUser().getSpeedUnit());
    },

    /**
     * Relative humidity
     * @returns {String}  Ex: 90 (Range: 0 - 100)
     */
    getHumidity: function() {
      return this._get('rH');
    },

    /**
     * UV index
     * @returns {String}  Ex: 8 (Range: 0 to 11 and 999)
     */
    getUVIndex: function() {
      return this._get('uvIdx');
    },

    /**
     * UV index description
     * @returns {String}  Ex: High (Range:  Extreme, High, Low, Minimal, Moderate, No Report, Not Available)
     */
    getUVDescription: function() {
      return this._get('uvDes');
    },

    /**
     * Barometric Trend Ascii representation
     * @returns {String}  Ex: Rising (Range: Falling, Falling Rapidly, Rising, Rising Rapidly, Steady)
     */
    getBarometricText: function() {
      return this._get('baroTrndAsc');
    },

    /**
     * Barometric Trend - Note - you cannot determine if pressure is rising or falling rapidly with this field, it is recommended you use baroTrndAsc
     * @returns {String}  Ex: 2 (Range: 0 = steady, 1 = rising, 2 = falling)
     */
    getBarometric: function() {
      return this._get('');
    },

    /**
     * Ceiling in feet or metters
     * @returns {String}  Ex: 20 (Range:  0 to 30000 or null)
     */
    getCeiling: function() {
      var unit = this.getUser().getSpeedUnit();
      return this._get('ceil'+ unit==='M' ? unit : '');
    },

    /**
     * Clouds for observations. Indicates if the sky is clear, few clouds, scattered clouds, broken layer of clouds or is completely overcast.
     * @returns {String}  Ex: SKC (Range: SKC,CLR,SCT,FEW,BKN,OVC)
     */
    getClouds: function() {
      return this._get('clds');
    },

    /**
     * Dewpoint Fahrenheit or Celsius
     * @returns {String}  Ex: 50 (Range: -80F - 100F or -62C - 37C)
     */
    getDewPoint: function() {
      return this._get('dwpt'+this.getUser().getTempUnit());
    },

    /**
     * Heat index fahrenheit - only usable above 70 degrees F or Celsius - only usable above 21 C
     * @returns {String}  Ex: 90
     */
    getHeatIndex: function() {
      return this._get('hI'+this.getUser().getTempUnit());
    },

    /**
     * Barometric pressure in millibars
     * @returns {String}  Ex: 1033.3
     * 12/12/13 DBlakely - Removed unit from returned value for ease of data validation module controllers
     */
    getPressure: function() {
      var unit = this.getUser().getPressureUnit();
      return (unit === 'mb' ? this._get('pres') : this._get('alt'));
    },

    /**
     * Pressure change - change in pressure over the last hour
     * @returns {String}  Ex:  -0,02
     */
    getPressureChange: function() {
      return this._get('presChnge');
    },

    /**
     * Visibility in miles - if greater than 120.0 default to 999 for unlimited or  in kilometers -if greater than 193.0 default to 999 for unlimited
     * @returns {String}  Ex: 10.08
     * 12/12/13 DBlakely - Removed unit from returned value for ease of data validation by module controllers
     */
    getVisibility: function() {
      return this._get('vis'+this.getUser().getSpeedUnit());
    },

    /**
     * Wind chill in fahrenheit - only use below 40 F - 24 hour value or in celsius - only use below 5 C - 24 hour value
     * @returns {String}  Ex: -25
     */
    getWindChill: function() {
      return this._get('wC'+this.getUser().getTempUnit());
    },

    /**
     * Obs qualifier severity rating
     * @returns {String}  Ex: 2
     */
    getQualifierSeverity: function() {
        return this._get('qulfrSvrty');
    },

    /**
     * Obs extended qualifier phrase
     * @returns {String}  Ex: It is now more than 25 degrees colder than it was yesterday at this time.
     */
    getQualifierPhrase: function() {
        return this._get('_extendedQulfrPhrase');
    },

    /**
     * Get Local observation time
     * @returns {String}  Ex. 2014-04-11T23:00:00.000+03:00
     */
    getLocalObsTime: function() {
      return this._get('_obsDateLocalTimeISO');
    }

  });
}]);;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/9/13
 * Time: 3:53 PM
 * To change this template use File | Settings | File Templates.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('WxdLocModelClass',['RecordModel',function(RecordModel){
  return RecordModel.extend({
    recordType: 'loc',

    setResponse: function( response ) {
      this.data = response;
      this.header = "NA";
    },

    toSavedLocation: function(savedLocation) {
      var savedLocData = angular.copy(this.data);
      return savedLocation.fromDto(savedLocData);
    },

    getFullLocId: function() {
      return this._get('locId') + ':' + this._get('locType') + ':' + this._get('cntryCd');
    },

    getLocType: function() {
      return this._get('locType');
    },

    getLocId: function() {
      return this._get('locId');
    },

    getCountryCode: function() {
      return this._get('cntryCd');
    },

    getPresName: function() {
      return this._get('prsntNm');
    },

    getLatitude: function() {
      return this._get('lat');
    },

    getLongitude: function() {
      return this._get('long');
    },

    getTimezoneAbbrev: function() {
      return this._get('tmZnAbbr');
    },

    getGmtDiff: function() {
      return this._get('gmtDiff');
    },

    getZipCode: function() {
      return this._get('zipCd');
    },

    getGMTOffset: function() {
      return this._get('gmtDiff');
    },

    getGeocode: function () {
      return this._get('lat') + ',' + this._get('long');
    },

    getStateCode: function() {
      return this._get('stCd');
    },

    getStateName: function() {
      return this._get('stNm');
    },

    /**
     * Trying to standardize getters across wxdLoc, xwebLoc & savedLocations Models
     * @returns {*}
     */
    getState: function() {
      return this._get('stNm');
    },

    getCountry : function() {
      return this._get("_country");
    },

    getDaylightSavingsIndicator : function() {
      return this._get("dySTInd");
    },

    getDaylightSavingsActive: function() {
      return this._get("dySTAct");
    },

    getRegion : function() {
      return this._get('regSat');
    },

    getCity : function() {
      return this._get('cityNm');
    },

    getClsRad : function() {
      return this._get('clsRad');
    },

    getDmaCode : function() {
      return this._get('dmaCd');
    }
  });
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 11/12/13
 * Time: 3:37 PM
 * Comments: This model contains two attributes key and name. Go for it.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('QLocModelClass',['RecordModel',function( RecordModel ) {
  return RecordModel.extend({
    recordType: 'QLocRecord',

    getKey: function() {
      return this._get('key');
    },

    getName: function() {
      return this._get('name');
    },

    setResponse: function( response ) {
      this.data = response;
      this.header = "NA";
    }
  });
}]);;
/**
 * Author: ksankaran (Velu)
 * Date: 2/6/14
 * Time: 4:01 PM
 * Comments:
 */

twc.shared.apps.factory('PcoPage',['TwcModel', 'twcUtil', 'twcPco', '$q', '$injector', '$rootScope',function(TwcModel, twcUtil, twcPco, $q, $injector, $rootScope){
  /*
   * Page will be READ-WRITE object and hence, will use the new simple PcoModel.
   */
  var Page = TwcModel.extend({
    construct: function() {
      this.attrs = twcPco.get('page').getAttributes();
      this._set('pagepromise_wrapper', $q.defer());
      // wait for device promises and refresh them again.
      var _self = this;
      jQuery.when.apply(jQuery, twcPco.get("page").promises).done(function() {
        _self.attrs =  twcPco.get('page').getAttributes();

        var currLoc = _self._get('currentLocation'), model = _self._get('currentLocationModel');
        if(!!currLoc && !model) {
          var ModelClass = $injector.has("WxdLocModelClass") && $injector.get("WxdLocModelClass");
          if(!!ModelClass) {
            _self.set({'currentLocationModel' : (new ModelClass(currLoc))});
          }
        }
        _self._get("pagepromise_wrapper").resolve();
      });
    },

    getCurrentLocId : function() {
      return this._get('currentLocId');
    },

    getCurrentLocation : function() {
      return this._get('currentLocation');
    },

    getGeocode: function () {
      var currentLocation = this.getCurrentLocation();
      return currentLocation.lat + ',' + currentLocation.long;
    },

    getCurrentLocationModel : function() {
      return this._get('currentLocationModel');
    },

    getAMPM : function() {
      return this._get('ampm');
    },

    getEnv : function() {
      return this._get('env');
    },

    getFromString : function() {
      return this._get('fromStr');
    },

    getFV : function() {
      return this._get('fv');
    },

    getLanguage : function() {
      return this._get('lang');
    },

    getLocale : function() {
      return this._get('locale');
    },

    getServerDate : function() {
      return this._get('serverdate');
    },

    getServerTime : function() {
      return this._get('servertime');
    },

    getServerDay : function() {
      return this._get('serverday');
    },

    getServerHours : function() {
      return this._get('serverhrs');
    },

    getPagePromises : function() {
      return this._get("pagepromise_wrapper").promise;
    },

    getBackToPage : function() {
      return this._get('backTo');
    },

    getPartner : function(){
      return this._get('partner');
    },

    getPageType : function() {
      return this._get('content');
    },

    getTimeZone : function() {
      return this._get('timezone');
    },

    getScreenSize : function() {
      return this._get('screenSize');
    }
  });

  return new Page();
}]);
;
/**
 * Author: steve
 * Date: 2/13/14
 * Time:
 * Comments:
 */

twc.shared.apps.factory('PcoAd',['TwcModel', 'twcUtil', 'twcPco', '$q',function(TwcModel, twcUtil, twcPco, $q){
  /*
   * Device should be READ-ONLY object and hence, will not have setter methods.
   */
  var Ad = TwcModel.extend({
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('ad').getAttributes() ) );
      // wait for device promises and refresh them again.
      var _self = this;
      $q.all(twcPco.get("ad").promises).then(function() {
        _self.fromDto( twcUtil.clone( twcPco.get('ad').getAttributes() ) );
      });
    },
    getCustom_Params : function() {
      return this._get('cust_params');
    },
    getAd_Positions : function() {
      return this._get('ad_positions');
    },
    getAdPromises : function() {
      return $q.all(twcPco.get("ad").promises);
    },
    getRefreshSlots : function() {
      return this._get('DFPSlots');
    }
  });

  return new Ad();
}]);;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 8/26/13
 * Time: 4:01 PM
 *
 */
twc.shared.apps.service('twcPco',function () {
  return TWC.pco;
});
;
/**
 * Author: ksankaran (Velu)
 * Date: 7/2/14
 * Time: 11:25 AM
 * Comments: The run method ensures that rootScope vars are always set. There are three
 * different variable settings: page, user and dynamic. Use jQuery.when as $q.all is no
 * longer compatible with jquery promises.
 */

twc.shared.apps.factory('dynamicLocResolvedEvent', ['customEvent', function (customEvent) {
  /**
   *  DYNAMIC_LOC_RESOLVED represents both the userCurrLoc and the pageLoc being
   *  resolved, so that pages/modules using dynamicLocName, dynamicLocId, etc.,
   *  can guarantee a value is present in those fields. This fixes the bug in
   *  DKB-1084 and related. - Cord Hamrick
   */
  return customEvent.getEvent('DYNAMIC_LOC_RESOLVED');
}]).run(['$rootScope', '$q', 'twcPco', 'PcoPage', 'pcoUser', 'customEvent', 'dynamicLocResolvedEvent', '$filter', 'WxdLocModelClass', function ($rootScope, $q, twcPco, PcoPage, pcoUser, customEvent, dynamicLocResolvedEvent, $filter, WxdLocModelClass) {

  var jq = window.jQuery,
      setLocation;

  setLocation = function (location, objectKey, idKey, nameKey) {
    if (!!location) {
      // set rootscope location for global placement.
      var hasLocation = ('loc' in location);
      $rootScope[objectKey] = hasLocation ? location : null;
      $rootScope[idKey]     = hasLocation ? location.loc : null;
      $rootScope[nameKey]   = (hasLocation && 'prsntNm' in location) ? $filter('glomoLocationName')(location) : null;

    }
  };

  // Page Location
  jq.when.apply(jq, twcPco.get('page').promises).done(function () {
    var currLoc = PcoPage._get('currentLocation');
    setLocation(currLoc, 'pagelocation', 'pageLocId', 'pageLocName');
  });

  // User Location
  jq.when.apply(jq, twcPco.get('user').promises).done(function () {
    var userPrefLoc = pcoUser.getPreferredLocation(), currLoc = pcoUser._get('currentLocation');
    setLocation(userPrefLoc || currLoc, 'userlocation', 'userLocId', 'userLocName');
  });

  // Dynamic Intelligent Location
  jq.when.apply(jq, [].concat(twcPco.get('page').promises, twcPco.get('user').promises)).done(function () {
    var prefLocation = pcoUser.getPreferredLocation(),
        setDynamicLoc;

    setDynamicLoc = function () {
      var currPageLoc = PcoPage._get('currentLocation'),
          userCurrLoc = pcoUser._get('currentLocation');

      setLocation(
        ((currPageLoc && !currPageLoc.error) ? currPageLoc : (prefLocation || userCurrLoc)),
        'dynamiclocation',
        'dynamicLocId',
        'dynamicLocName'
      );

      // Page promises (includes the currPageLoc) and user promises (includes userCurrLoc)
      // are resolved, so let everyone know the dynamic loc is now available...
      if (dynamicLocResolvedEvent.state() !== 'resolved') {
        dynamicLocResolvedEvent.resolve();
      }

    };

    if (!prefLocation) {
      setDynamicLoc();
    }

    customEvent.getEvent('preferred_location_change').progress(function (data) {
      setDynamicLoc();
    });

  });
}]);
;
(function (angular, $) {
  angular.module('bnLazyLoad', [])
    .directive('bnLazySrc', bnLazySrcDirective);

  bnLazySrcDirective.$inject = ['$window', '$document'];

  function bnLazySrcDirective($window, $document) {
    // I manage all the images that are currently being
    // monitored on the page for lazy loading.
    var lazyLoader = (function () {

      // I maintain a list of images that lazy-loading
      // and have yet to be rendered.
      var images = [];

      // I define the render timer for the lazy loading
      // images to that the DOM-querying (for offsets)
      // is chunked in groups.
      var renderTimer = null;
      var renderDelay = 100;

      // I cache the window element as a jQuery reference.
      var win = $($window);

      // I cache the document document height so that
      // we can respond to changes in the height due to
      // dynamic content.
      var doc = $document;
      var documentHeight = doc.height();
      var documentTimer = null;
      var documentDelay = 2000;

      // I determine if the window dimension events
      // (ie. resize, scroll) are currenlty being
      // monitored for changes.
      var isWatchingWindow = false;


      // ---
      // PUBLIC METHODS.
      // ---


      // I start monitoring the given image for visibility
      // and then render it when necessary.
      function addImage(image) {

        images.push(image);

        if (!renderTimer) {

          startRenderTimer();

        }

        if (!isWatchingWindow) {

          startWatchingWindow();

        }

      }


      // I remove the given image from the render queue.
      function removeImage(image) {

        // Remove the given image from the render queue.
        for (var i = 0; i < images.length; i++) {

          if (images[i] === image) {

            images.splice(i, 1);
            break;

          }

        }

        // If removing the given image has cleared the
        // render queue, then we can stop monitoring
        // the window and the image queue.
        if (!images.length) {

          clearRenderTimer();

          stopWatchingWindow();

        }

      }


      // ---
      // PRIVATE METHODS.
      // ---


      // I check the document height to see if it's changed.
      function checkDocumentHeight() {

        // If the render time is currently active, then
        // don't bother getting the document height -
        // it won't actually do anything.
        if (renderTimer) {

          return;

        }

        var currentDocumentHeight = doc.height();

        // If the height has not changed, then ignore -
        // no more images could have come into view.
        if (currentDocumentHeight === documentHeight) {

          return;

        }

        // Cache the new document height.
        documentHeight = currentDocumentHeight;

        startRenderTimer();

      }


      // I check the lazy-load images that have yet to
      // be rendered.
      function checkImages() {

        // Log here so we can see how often this
        // gets called during page activity.
        // console.log('Checking for visible images...');

        var visible = [];
        var hidden = [];

        // Determine the window dimensions.
        var windowHeight = win.height();
        var scrollTop = win.scrollTop();

        // Calculate the viewport offsets.
        var topFoldOffset = scrollTop;
        var bottomFoldOffset = (topFoldOffset + windowHeight);
        var i = 0;

        // Query the DOM for layout and seperate the
        // images into two different categories: those
        // that are now in the viewport and those that
        // still remain hidden.
        for (i = 0; i < images.length; i++) {

          var image = images[i];

          if (image.isVisible(topFoldOffset, bottomFoldOffset)) {

            visible.push(image);

          } else {

            hidden.push(image);

          }

        }

        // Update the DOM with new image source values.
        for (i = 0; i < visible.length; i++) {

          visible[i].render();

        }

        // Keep the still-hidden images as the new
        // image queue to be monitored.
        images = hidden;

        // Clear the render timer so that it can be set
        // again in response to window changes.
        clearRenderTimer();

        // If we've rendered all the images, then stop
        // monitoring the window for changes.
        if (!images.length) {

          stopWatchingWindow();

        }

      }


      // I clear the render timer so that we can easily
      // check to see if the timer is running.
      function clearRenderTimer() {

        clearTimeout(renderTimer);

        renderTimer = null;

      }


      // I start the render time, allowing more images to
      // be added to the images queue before the render
      // action is executed.
      function startRenderTimer() {

        renderTimer = setTimeout(checkImages, renderDelay);

      }


      // I start watching the window for changes in dimension.
      function startWatchingWindow() {

        isWatchingWindow = true;

        // Listen for window changes.
        win.on('resize.bnLazySrc', windowChanged);
        win.on('scroll.bnLazySrc', windowChanged);

        // Set up a timer to watch for document-height changes.
        documentTimer = setInterval(checkDocumentHeight, documentDelay);

      }


      // I stop watching the window for changes in dimension.
      function stopWatchingWindow() {

        isWatchingWindow = false;

        // Stop watching for window changes.
        win.off('resize.bnLazySrc');
        win.off('scroll.bnLazySrc');

        // Stop watching for document changes.
        clearInterval(documentTimer);

      }


      // I start the render time if the window changes.
      function windowChanged() {

        if (!renderTimer) {

          startRenderTimer();

        }

      }


      // Return the public API.
      return({
        addImage: addImage,
        removeImage: removeImage
      });

    })();


    // ------------------------------------------ //
    // ------------------------------------------ //


    // I represent a single lazy-load image.
    function LazyImage(element) {

      // I am the interpolated LAZY SRC attribute of
      // the image as reported by AngularJS.
      var source = null;

      // I determine if the image has already been
      // rendered (ie, that it has been exposed to the
      // viewport and the source had been loaded).
      var isRendered = false;

      // I am the cached height of the element. We are
      // going to assume that the image doesn't change
      // height over time.
      var height = null;


      // ---
      // PUBLIC METHODS.
      // ---


      // I determine if the element is above the given
      // fold of the page.
      function isVisible(topFoldOffset, bottomFoldOffset) {

        // If the element is not visible because it
        // is hidden, don't bother testing it.
        if (!element.is(':visible')) {

          return(false);

        }

        // If the height has not yet been calculated,
        // the cache it for the duration of the page.
        if (height === null) {

          height = element.height();

        }

        // Update the dimensions of the element.
        var top = element.offset().top;
        var bottom = (top + height);

        // Return true if the element is:
        // 1. The top offset is in view.
        // 2. The bottom offset is in view.
        // 3. The element is overlapping the viewport.
        return(
            (
              (top <= bottomFoldOffset) &&
              (top >= topFoldOffset)
           ) || (
              (bottom <= bottomFoldOffset) &&
              (bottom >= topFoldOffset)
           ) || (
              (top <= topFoldOffset) &&
              (bottom >= bottomFoldOffset)
           )
       );

      }


      // I move the cached source into the live source.
      function render() {

        isRendered = true;

        renderSource();

      }


      // I set the interpolated source value reported
      // by the directive / AngularJS.
      function setSource(newSource) {

        source = newSource;

        if (isRendered) {

          renderSource();

        }

      }


      // ---
      // PRIVATE METHODS.
      // ---


      // I load the lazy source value into the actual
      // source value of the image element.
      function renderSource() {

        element[0].src = source;

      }


      // Return the public API.
      return({
        isVisible: isVisible,
        render: render,
        setSource: setSource
      });

    }


    // ------------------------------------------ //
    // ------------------------------------------ //


    // I bind the UI events to the scope.
    function link($scope, element, attributes) {

      var lazyImage = new LazyImage(element);

      // Start watching the image for changes in its
      // visibility.
      lazyLoader.addImage(lazyImage);


      // Since the lazy-src will likely need some sort
      // of string interpolation, we don't want to
      attributes.$observe(
        'bnLazySrc',
        function (newSource) {

          lazyImage.setSource(newSource);

        }
     );


      // When the scope is destroyed, we need to remove
      // the image from the render queue.
      $scope.$on(
        '$destroy',
        function () {

          lazyLoader.removeImage(lazyImage);

        }
     );

    }


    // Return the directive configuration.
    return({
      link: link,
      restrict: 'A'
    });

  }
})(angular, jQuery);
;
/**
 * Author: ksankaran (Velu)
 * Date: 1/6/14
 * Time: 4:23 PM
 * Comments: Wrapper model for twclog pco node. Straightforward factory and not a
 * twcClass like other models as this serves just as tunnel for pco node functions.
 */

twc.shared.apps.service('twcLog',['twcPco',function(twcPco){
  return twcPco.get("twclog");
}]).factory('PcoLog',['TwcModel', 'twcUtil', 'twcLog',function(TwcModel, twcUtil, twcLog){
  /*
   * Device should be READ-ONLY object and hence, will not have setter methods.
   */
  return {
    debug: function() {
      twcLog.debug.apply(twcLog, Array.prototype.slice.call(arguments, 0));
    },

    error: function() {
      twcLog.error.apply(twcLog, Array.prototype.slice.call(arguments, 0));
    }
  };
}]);;

/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 8/26/13
 * Time: 4:01 PM
 */
twc.shared.apps.factory('pcoUser',['TwcModel','twcPco','twcUtil','$q','locUtil','PcoSavedLocationModel','customEvent','$filter',function(TwcModel,twcPco,twcUtil,$q,locUtil,PcoSavedLocationModel,customEvent,$filter){
  var User = TwcModel.extend({

    /**
     * Note that resource is passed in by a different procedure instead of using an injectable service.
     * This is designed in favor of
     *  1. testing
     *  2. flexibility - so another resource can build a user and attach itself to the user that it builds
     */
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('user').getAttributes() ) );
      this._set('userpromise_wrapper', $q.defer());
      // wait for device promises and refresh them again.
      var _self = this;
      jQuery.when.apply($, twcPco.get("user").promises).done( function() {
        _self.fromDto( twcUtil.clone( twcPco.get('user').getAttributes() ) );
        _self._get("userpromise_wrapper").resolve();
      });

      customEvent.getEvent("preferred_location_change").progress(function(data) {
        if(data && data.locations) {
          _self.set({"preferredLocation" : data.locations});
        }
      });
    },
    getUserPromises : function() {
      return this._get("userpromise_wrapper").promise;
    },

    getGender: function() {
      return this._get('gender');
    },

//    getMapPreferences: function() {
//      return this._get('mapPrefs');
//    },

    getPreferredDeclaration: function() {
      return this._get('preferredDeclaration');
    },

    getRmid: function(){
      return this._get('rmid');
    },

    getTimezoneOffset: function() {
      return this._get('tzOffset');
    },


    getFlashPlayerVersion: function() {
      return this._get('flash');
    },

    getBrowser: function() {
      return this._get('browser');
    },

    getAgeGroups: function() {
      return this._get('age');
    },

    getBackToPage: function() {
      return this._get('backTo');
    },

    getUnit: function() {
      return this._get('unit');
    },

    getSpeedMeasure: function() {
      var pLocale = ((TWC && TWC.Configs && TWC.Configs.dsx && TWC.Configs.dsx.locale) || (TWC && TWC.Titan && TWC.Titan.locale));
      if(pLocale && pLocale === "en_GB") {
        return 'mph';
      }
      return this._get('unit') === 'e' ? 'mph' : 'km/h';
    },

    getPressureUnit: function() {
      return this._get('unit') === 'e' ? 'in' : 'mb';
    },

    getDistanceUnit: function() {
      return this._get('unit') === 'e' ? 'mi' : 'km';
    },

    getSpeedUnit: function() {
      return this._get('unit') === 'e' ? 'M' : 'K';
    },

    getTempUnit: function() {
      return this._get('unit') === 'e' ? 'F' : 'C';
    },

    getAccumulationUnit: function() {
      return this._get('unit') === 'e' ? 'in' : 'cm';
    },

    getPrecipUnit: function() {
      return this._get('unit') === 'e' ? 'in' : 'mm';
    },

    getFreezingPoint: function() {
      return this.getTempUnit() === 'F' ? 32 : 0;
    },

    translateUnits: function(unitLabel) {
      var pfTranslateFilter = $filter('pfTranslate');
      var translatedUnitLabel = pfTranslateFilter(unitLabel, {
        context: 'weather_units'
      });
      return translatedUnitLabel;
    },

    getSpeedMeasureLabel: function() {
      return this.translateUnits(this.getSpeedMeasure());
    },

    getPressureUnitLabel: function() {
      return this.translateUnits(this.getPressureUnit());
    },

    getDistanceUnitLabel: function() {
      return this.translateUnits(this.getDistanceUnit());
    },

    getSpeedUnitLabel: function() {
      return this.translateUnits(this.getSpeedUnit());
    },

    getTempUnitLabel: function() {
      return this.translateUnits(this.getTempUnit());
    },

    getAccumulationUnitLabel: function() {
      return this.translateUnits(this.getAccumulationUnit());
    },

    getPrecipUnitLabel: function() {
      return this.translateUnits(this.getPrecipUnit());
    },

    /**
     * Dynamically retrieve the correct temp unit based on the current unit system
     * @param unit
     * @returns {*}
     */
    setTempUnit: function(unit, successCallbackFn, errorCallbackFn) {
      var unitSys, promise;
      switch(unit) {
        case 'F' : unitSys = 'e';break;
        default: unitSys = 'm';break;
      }
      this._set('unit',unitSys);

      // Set flag indicating user has set units
      twcPco.setNodeValue('user','userSpecifiedUnits', true);

      // Persist change in localStorage
      promise = twcPco.setNodeValue('user','unit',unitSys);
      promise.then(successCallbackFn, errorCallbackFn);
      return this;
    },

    getIsSignedIn: function() {
      return !!this.getSignedInToken();
    },

    getSignedInToken: function() {
      return this._get('signedIn');
    },

    getLocale: function() {
      return this._get('locale');
    },

    setLocale: function( locale ) {
      this._set("locale", locale);

      // Persist change in localStorage
      twcPco.setNodeValue('user','locale',locale);
      return this;
    },

    getEditionLocale: function() {
      return this._get('editionLocale');
    },

    setEditionLocale: function(locale, successCallbackFn, errorCallbackFn) {
      
      this._set('editionLocale', locale);

      promise = twcPco.setNodeValue('user','editionLocale', locale);
      promise.then(successCallbackFn, errorCallbackFn);

      return this;
    },

    getPreferredLocation: function() {
      return this._get("preferredLocation");
    },

    getFullLocationList: function() {
      var sl = this._get("savedLocations") || [],
          rs = this._get("recentSearchLocations") || [];
      return sl.concat(rs);
    },

    getSavedLocations: function() {
      return twcUtil.map(this._get("savedLocations"),function(savedLocation){
        return new PcoSavedLocationModel().fromPcoData(savedLocation);
      });
    },

    addSavedLocation: function(recentLoc) {
      this.addLocation(recentLoc,"saved");
      return this;
    },

    removeSavedLocation: function(savedLocation) {
      this.removeLocation(savedLocation,"saved");
      return this;
    },

    getRecentSearchLocations: function() {
      return twcUtil.map(this._get("recentSearchLocations"), function(recentLoc){
        return new PcoSavedLocationModel().fromPcoData(recentLoc);
      });
    },

    addRecentSearchLocation: function(recentLoc) {
      this.addLocation(recentLoc,"recentSearch");
      return this;
    },

    removeRecentSearchLocation: function(recentSearchLocation) {
      this.removeLocation(recentSearchLocation,"recentSearch");
      return this;
    },

    addLocation: function(location, type) {
      // type can be 'Saved' or 'RecentSearch'
      if (location) {
        var alreadySaved = false,
            nodeType = type + "Locations",
            currentLocs  = this._get(nodeType) || [],
            deleteType  = (type === 'saved') ? 'recentSearch' : 'saved',
            deleteNodeType = deleteType + "Locations",
            locObjArry = [];

        location = location.attrs ? location.attrs : location;
        location = location.data ? location.data : location;

        for(var i = 0,l=currentLocs.length; i < l; i++) {
          if(locUtil.areLocationsEqual(location,currentLocs[i])) {
            alreadySaved = true;
            break;
          }
        }

        // Change owner : VELU
        // Change ID    : REBOOTKM-277
        // Change       : remove from recent search after addition to savedLocations.
        // Change       : do not remove from savedLocations if already there when
        //              : trying to save to recentSearchLocations and do not add to
        //              : recentSearchLocations
        var deleteLocations = this._get(deleteNodeType) || [];
        for(var idx = 0,len=deleteLocations.length; idx < len; idx++) {
          if(locUtil.areLocationsEqual(location, deleteLocations[idx])) {
            if(deleteType === 'recentSearch'){
              this.removeLocation(deleteLocations[idx], deleteType);
              break;
            }else{
              alreadySaved = true;
            }
          }
        }

        if(!alreadySaved){
          locObjArry = this._get(nodeType) || [];
          if(type === "saved"){
            locObjArry.push(location);
          }else{
            this._get(nodeType).unshift(location);
          }
          var truncatedLocations = locObjArry.slice(0,Math.min(locObjArry.length,10));

          // Persist change in localStorage
          twcPco.setNodeValue("user",nodeType,truncatedLocations);
        }
      }
    },

    removeLocation: function(location, type) {
      // type can be 'Saved' or 'RecentSearch'
      if (location) {

        var nodeType = type + 'Locations',
            locObjArry = [],
            currentLocations = this._get(nodeType);

        location = location.attrs ? location.attrs : location;
        location = location.data ? location.data : location;

        for (var i=currentLocations.length-1;i>=0;i--) {
          if (currentLocations[i].locId === location.locId) {
            currentLocations.splice(i,1);
            break;
          }
        }

        // Persist change in localStorage
        twcPco.setNodeValue('user', nodeType, currentLocations);

      }
    },

    updateLocation: function(location){
      if(location) {
        var savedLocs   = this._get("savedLocations");

        location = location.attrs ? location.attrs : location;
        location = location.data ? location.data : location;

        // if found, save the locs - completely.
        if(savedLocs && angular.isArray(savedLocs)) {
          for(var idx = 0,len=savedLocs.length; idx < len; idx++) {
            if(locUtil.areLocationsEqual(location, savedLocs[idx])) {
              angular.extend(savedLocs[idx], location);
              break;
            }
          }
        }

        // Persist change in localStorage
        twcPco.setNodeValue('user','savedLocations',savedLocs);
      }
    }
  });

  return new User();
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 3/17/14
 * Time: 1:37 PM
 * Comments:
 */

twc.shared.apps.service('twcPerf',['twcPco',function(twcPco){
  return twcPco.get("performance");
}]).factory('PcoPerf',['TwcModel', 'twcUtil', 'twcPerf',function(TwcModel, twcUtil, twcPerf){
    /*
     * Device should be READ-ONLY object and hence, will not have setter methods.
     */
    return {
      logDsxCall: function() {
        twcPerf.log_dsx_call.apply(twcPerf, Array.prototype.slice.call(arguments, 0));
      },

      log: function() {
        twcPerf.log.apply(twcPerf, Array.prototype.slice.call(arguments, 0));
      }
    };
  }]);;
/**
 * Author: ksankaran (Velu)
 * Date: 10/2/13
 * Time: 3:53 PM
 * Comments:
 */

twc.shared.apps.factory('PcoDevice',['TwcModel', 'twcUtil', 'twcPco', '$q',function(TwcModel, twcUtil, twcPco, $q){
  /*
   * Device should be READ-ONLY object and hence, will not have setter methods.
   */
  var Device = TwcModel.extend({
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('device').getAttributes() ) );
      // wait for device promises and refresh them again.
      var _self = this;
      $q.all(twcPco.get("device").promises).then(function() {
        _self.fromDto( twcUtil.clone( twcPco.get('device').getAttributes() ) );
      });
    },

    onReady : function(callback) {
      $q.all(twcPco.get("device").promises).then(function() {
        callback();
      });
    },

    getOpenDDRCrawler : function() {
      return this._get('OpenDDRCrawler');
    },

    getOpenDDRDesktop : function() {
      return this._get('OpenDDRDesktop');
    },

    getOpenDDRDevice : function() {
      return this._get('OpenDDRDevice');
    },

    getOpenDDRDisplay : function() {
      return this._get('OpenDDRDisplay');
    },

    getOpenDDRId : function() {
      return this._get('OpenDDRId');
    },

    getOpenDDRJS : function() {
      return this._get('OpenDDRJS');
    },

    getOpenDDRTablet : function() {
      return this._get('OpenDDRTablet');
    },

    getOpenDDRWireless : function() {
      return this._get('OpenDDRWireless');
    },

    getUserAgent : function() {
      return this._get('UserAgent');
    },

    getBrowserId : function() {
      return this._get('browserId');
    },

    getBrowserName : function() {
      return this._get('browserName');
    },

    getBrowserOS : function() {
      return this._get('browserOS');
    },

    getBrowserVer : function() {
      return this._get('browserVer');
    },

    getDClass : function() {
      return this._get('dClass');
    },

    getDClassVersion : function() {
      return this._get('dClassVersion');
    }
  });

  return new Device();
}]);;
/**
 * Author: ksankaran (Velu)
 * Date: 10/2/13
 * Time: 3:53 PM
 * Comments:
 */

twc.shared.apps.factory('PcoProducts',['TwcModel', 'twcUtil', 'twcPco', '$q',function(TwcModel, twcUtil, twcPco, $q){
  /*
   * Product node is for module specific settings and data
   */
  var Products = TwcModel.extend({
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('products').getAttributes() ) );
    },

    onReady : function(callback) {
      $q.all(twcPco.get("products").promises).then(function() {
        callback();
      });
    },

    getMapState: function(key) {
      return this._get(key) || {};
    },

    // @deprecated
    getPangeaState  : function() {
      return this._get('pangeaMap') || {};
    },

    saveMapState : function(key, preferences) {
      var data = {};
      data[key] = angular.extend(this.getMapState(key), preferences);
      this.set(data);

      // Persist change in localStorage
      twcPco.setNodeValue('products', key, this.getMapState(key));
    },

    // @deprecated
    savePangeaState : function(preferences) {
      this.set({'pangeaMap' : angular.extend(this.getPangeaState(), preferences)});

      // Persist change in localStorage
      twcPco.setNodeValue('products','pangeaMap', this.getPangeaState());
    },

    getPangeaBaseMap : function() {
      var state = this.getPangeaState();
      return (state && state.basemap);
    },

    getBaseMap: function(key) {
      var state = this.getMapState(key);
      return (state && state.basemap);
    },

    getMapOpacityConfigs : function(key) {
      return this.getMapState(key)["opacity"];
    },

    // @deprecated
    getOpacityConfigs : function() {
      return this.getPangeaState()["opacity"];
    },

    // @deprecated
    setPangeaBaseMap : function(baseMap) {
      this.savePangeaState({'basemap' : baseMap});
    },

    setBaseMap : function(key, baseMap) {
      this.saveMapState(key, {'basemap' : baseMap});
    }
  });

  return new Products();
}]);
;
/**
 * Created with PhpStorm
 * User: ssherwood
 * Date: 8/27/14
 * Time: 8:24 AM
 *
 */

twc.shared.apps.factory('PcoProfile',['TwcModel', 'twcUtil', 'twcPco', '$q',function(TwcModel, twcUtil, twcPco, $q){
  /*
   * Device should be READ-ONLY object and hence, will not have setter methods.
   */
  var Profile = TwcModel.extend({
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('profile').getAttributes() ) );
      // wait for device promises and refresh them again.
      var _self = this;
      $q.all(twcPco.get("profile").promises).then(function() {
        _self.fromDto( twcUtil.clone( twcPco.get('profile').getAttributes() ) );
      });
    },
    getAddlParams : function() {
      return this._get('addlparams');
    },
    getLastModified : function() {
      return this._get('lastmodified');
    },
    getUpHostname : function() {
      return this._get('uphostname');
    },
    getUsername : function() {
      return this._get('username');
    },
    getUserId : function() {
      return this._get('userid');
    }
  });

  return new Profile();
}]);;
/*
    Formats the presentation name of WxdLoc and XWebLoc models from display.
    Exports the presentation name to the scoped value 'presentationName' for formatting using
    ng-bind, ng-bind-template, ng-bind-html, etc.

    Ex: <div data-twc-location-name="location" data-ng-bind-template="{{presentationName}}"></div>
 */
twc.shared.apps.directive('twcGlomoLocationName',['$filter', function($filter) {
   'use strict';
    var directiveObj = {
        scope: {
            twcLocationName: '='
        },
        link: function(scope) {
            var filter = $filter('glomoLocationName');
            scope.$watch( 'twcLocationName', function(loc) {
                scope.$parent.presentationName = filter(loc);
            });
        }
    };

    return directiveObj;
}]);;
/**
 * Author: ksankaran (Velu)
 * Date: 10/3/14
 * Time: 11:10 AM
 * Comments:
 */

twc.shared.apps.factory('PcoMetrics',['TwcModel', 'twcUtil', 'twcPco', function(TwcModel, twcUtil, twcPco){
  /*
   * Metrics should be READ-ONLY object and hence, will not have setter methods.
   */
  var Metrics = TwcModel.extend({
    init: function() {
      this.fromDto( twcUtil.clone( twcPco.get('metrics').getAttributes() ) );
    },
    getPageName : function() {
      return this._get('pagename');
    }
  });

  return new Metrics();
}]);;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/10/13
 * Time: 3:14 PM
 * To change this template use File | Settings | File Templates.
 */
twc.shared.apps.factory('PcoSavedLocationModel',['TwcModel',function(TwcModel){
  return TwcModel.extend({

    toPcoData: function() {
      return this.attrs;
    },

    fromPcoData: function(data) {
      this.set(data);
      return this;
    },

    setLongitude: function(lon) {
      return this._set('lon',lon);
    },

    setLatitude: function(lat) {
      return this._set('lat',lat);
    },

    setLocType: function(locType) {
      return this._set('locType',locType);
    },

    setLocId: function(locId) {
      return this._set('locId',locId);
    },

    getLocId: function() {
      return this._get('locId');
    },

    getId: function() {
      return this._get('id');
    },

    getLocType: function() {
      return this._get('locType');
    },

    getLatitude: function() {
      return this._get('lat');
    },

    getLongitude: function() {
      return this._get('long');
    },

    getGeocode: function() {
      return this._get('lat') + ',' + this._get('long');
    },

    getFullName: function() {
      return this._get('prsntNm');
    },

    setCountryCode: function(cd) {
      return this._set('cntryCd',cd);
    },

    getCountryCode: function() {
      return this._get('cntryCd');
    },

    setLocationRecord: function(locationRecord){
      jQuery.extend(this.attrs,locationRecord.data);
    },

    setObservationRecord: function(observationRecord) {
      this._observationRecord = observationRecord;
    },

    getObservationRecord: function() {
      return this._observationRecord;
    },

    markObservationRecordFetched: function() {
      this._observationRecordFetched = true;
      return this;
    },

    getIsObservationRecordFetched: function() {
      return !!this._observationRecordFetched;
    },

    getNickname: function() {
      return this._get('nickname');
    },

    setNickname: function(val) {
      return this._set('nickname', val);
    },

    getFullLocId: function() {
      return this.getLocId()+':'+this.getLocType()+':'+this.getCountryCode();
    },

    getCity: function() {
      return this.attrs['city'] ? this._get('city') : this._get('cityNm');
    },

    getState: function() {
      return this.attrs['state'] ? this._get('state') : this._get('stNm');
    },

    getCountry: function() {
      return this.attrs['countryName'] ? this._get('countryName') :  this._get('_country');
    },

    getStateName: function() {
      return this._get('stateName');
    },

    getBigCity: function() {
      return this._get('bigcity');
    },

    getCountryName: function() {
      return this.attrs['countryName'] ? this._get('countryName') : this._get('_country');
    },

    getCityName: function() {
      return this._get('cityNm');
    },

    getStateCode: function() {
      return this._get('stCd');
    },

    getTag: function() {
      return this._get('tag');
    },

    getAddress: function() {
      return this._get('address');
    },

    getPosition: function() {
      return this._get('position');
    }
  });

}]);
;
(function (angular, twc) {
  'use strict';

  /**
   * @ngdoc service
   * @name shared.GlomoSocialAPI
   * @description Social API wrapper. Currently implements Gigya.
   */
  twc.shared.apps.factory('GlomoSocialAPI', ['$window', '$q', 'customEvent', 'httpclient',
    function GlomoSocialAPI($window, $q, customEvent, httpclient) {
      var apiDeferred = $q.defer();

      // Private Social API
      var _socialAPI = {
        url: 'https://cdns.gigya.com/js/gigya.js',
        key: '2_zm_J-0UHOLnihq44PTNDi4NgoxbHWy24MhkmKlQMWPd3lOa1a-4r8uViC7HAu8Jr',
        params: {
          callback: $window.apiConnectCallback
        }
      };

      // Social API object
      var social = {
        apiLoaded: false,
        params: {},

        /**
         * Returns the Social API URL, currently Gigya URL
         * @returns {string}
         */
        getAPIUrl: function () {
          return _socialAPI.url + '?apiKey=' + _socialAPI.key;
        },

        /**
         * Social API Service Ready callback.
         *
         * @param response
         */
        onSocialAPIServiceReady: function (response) {
          social.apiLoaded = true;
          customEvent.getEvent('socialApiLoaded').resolve();
          apiDeferred.resolve(response);
        },

        /**
         * Loads the Social API (Gigya).
         * Currently, adds the Gigya onGigyaServiceReady callback to
         * call this.onSocialAPIServiceReady(), and emits the
         * socialApiLoaded custom event
         *
         * @see http://developers.gigya.com/display/GD/Advanced+Customizations+and+Localization
         * @see httpclient
         * @see getAPIUrl
         *
         * @returns {Deferred.promise}
         */
        loadAPI: function () {
          if (typeof gigya === 'undefined' && !social.apiLoaded && social.apiLoaded !== 'loading') {
            social.apiLoaded = 'loading';

            // Gigya's ServiceReady callback, resolve generic event.
            $window.onGigyaServiceReady = social.onSocialAPIServiceReady;

            httpclient.getScript({
              callback: function() {
                apiDeferred.resolve();
              },
              url: social.getAPIUrl()
            });
          } else {
            apiDeferred.resolve();
          }
          return apiDeferred.promise;
        },

        /**
         * Determines whether the social API has been loaded.
         *
         * @returns {boolean|*}
         */
        isAPIloaded: function () {
          if(true === this.apiLoaded && gigya) {
            return true;
          }

          if ('loading' === this.apiLoaded) {
            return false;
          }

          this.loadAPI();
          return false;
        },

        /**
         *
         * this is for share and not post bookmark
         * @param provider
         * @returns Function
         */
        connect: function (provider) {
          var df = $q.defer();
          _socialAPI.params = {
            provider: provider,
            callback: function (response) {
              df.resolve(response);
            }
          };
          social.loadAPI()
            .then(function () {
              gigya.socialize.addConnection(_socialAPI.params);
            });
          return df.promise;
        }
      };

      return social;
    }
  ]);
})(angular, twc);
;
(function (TWC, angular, twc, document) {
  'use strict';

  /**
   * Tag Builder Factory
   *
   * @ngdoc factory
   * @name shared.factory:TagBuilder
   * @description Assists in building
   */
  twc.shared.apps.factory('TagBuilder', ['$location', 'twcConstant', 'twcUtil', 'socialConstants',
    function TagBuilder($location, twcConstant, twcUtil, socialConstants) {
      /** @namespace TagBuilder */

      // @todo Move these into a types.js file somewhere for JS Documentation
      /**
       * A node in the DOM tree.
       *
       * @external Node
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node Node}
       */

      /**
       * A DOM Element.
       *
       * @external DOMElement
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element Element}
       */

      // @see glomo_social_sharing.config.js socialConstants Factory
      var typeProperties = socialConstants.metaSchema;

      /**
       * A single attribute object for a HTML tag.
       *
       * @classdesc A single attribute object for a HTML tag.
       * @param {string|TagAttribute|Object} attr Name of attribute (e.g., name, property, content).
       * @param {string} attr.name Name of attribute
       * @param {string|number} attr.value Name of attribute
       * @param {boolean} attr.primary Primary attribute for targeted selection.
       *
       * @param {?string|?number} value Value of the attribute.
       * @param {?boolean} primary Primary attribute for targeted selection.
       *
       * @constructor
       */
      function TagAttribute(attr, value, primary) {
        // If attribute is a string, add
        if (twcUtil.isString(attr)) {
          this.name = attr;
          this.value = value || '';
          this.primary = primary || false;

          // If attribute is an object, assume it contains all of our information
        } else if (twcUtil.isObject(attr)) {
          this.name = attr.name || twcUtil.keys(attr)[0];
          this.value = attr.value || twcUtil.values(attr)[0] || '';
          this.primary = attr.primary || false;
        }
      }

      // TagAttribute, isPrimary prototype
      TagAttribute.prototype = {
        /**
         * Name value of an HTML attribute (e.g., CONTENT='whatever', NAME='whatever').
         *
         * For example, in <meta NAME="og:url" CONTENT="https://domain.com/path/to/whatever"/>, name would be NAME or CONTENT.
         *
         * @memberof TagAttribute
         * @type {string}
         */
        name: null,

        /**
         * Whether this attribute is the primary attribute of the meta tag
         * for the purposes of creating a quality selector.
         *
         * @memberof TagAttribute
         * @type {boolean}
         */
        primary: false,

        /**
         * Value of an HTML attribute.
         * For example, in <meta name="OG:URL" content="HTTPS://DOMAIN.COM/PATH/TO/WHATEVER"/>, name would be OG:URL or HTTPS://DOMAIN.COM/PATH/TO/WHATEVER.
         *
         * @memberof TagAttribute
         * @type {string|number}
         */
        value: null,

        /**
         * Whether the attribute is primary or not.
         *
         * @memberof TagAttribute
         * @method
         * @returns {boolean} Whether primary.
         */
        isPrimary: function () {
          return this.primary || false;
        }
      };

      /**
       * Tag Class
       *
       * @classdesc HTML Tag class. `<this.tagName [this.attributes] />`
       * @constructor
       * @memberof TagBuilder
       *
       * @param {string} name Name of the tag.
       * @param {?object[]} attributes Attributes to add to the tag.
       */
      function Tag(name, attributes) {
        this.name = this.tagName = name;
        this.attributes = [];

        if (twcUtil.isArray(attributes)) {
          angular.forEach(attributes, function (value) {
            this.attributes.push(new TagAttribute(value));
          }, this);
        } else if (twcUtil.isObject(attributes)) {
          this.attributes.push(new TagAttribute(attributes));
        }
      }

      // HeadTag prototype
      Tag.prototype = {
        // Action to be taken on adding tag to the DOM
        _action: 'append',

        // Whether the tag was added to the DOM on its last operation.
        _added: false,

        // Whether the tag exists in the DOM on its last operation.
        _exists: false,

        // Whether the tag was updated in the DOM on its last operation.
        _updated: false,

        // Whether to allow duplicates
        allowDuplicates: false,

        // First attribute
        attr: null,

        /**
         * Tag attributes.
         *
         * Array of TagAttribute objects.
         *
         * @type {Array}
         * @see TagAttribute
         */
        attributes: [],

        // DOM context, head element or docoment.
        context: document,

        // Current cached head element.
        head: null,

        // Name of the tag's name/property attribute name (e.g., url).
        name: null,

        // Primary attribute
        primaryAttribute: null,

        // Actual tag in the DOM.
        tag: null,

        // Tag name (e.g., link, meta, title, etc.).
        tagName: null,

        // UTF
        utf: null,

        /**
         * Context of the DOM. Defaults to head tag or document.
         *
         * @method
         * @param {DOMElement} [context] DOM context element.
         * @returns {DOMElement} Document or Head tag.
         */
        getContext: function (context) {
          this.context = context || document;

          return this.context;
        },

        /**
         * Sets the context.
         *
         * @method
         * @param {DOMElement} context DOM context element.
         */
        setContext: function(context) {
          this.context = context;
        },

        /**
         * Gets the Head Tag from the DOM.
         *
         * @method
         * @param {boolean|any} fresh Whether to get the a fresh Head Tag from the DOM or use cached one.
         * @returns {DOMElement} Head Tag from the DOM.
         */
        getUtfTag: function (fresh) {
          if (!this.utf || fresh) {
            this.utf = document.querySelector('meta[charset^="utf"]');
          }

          return this.utf;
        },

        /**
         * Returns the primary attribute for the current tag.
         *
         * @method
         * @returns {object|TagAttribute}
         */
        getPrimaryAttribute: function () {
          if (this.primaryAttribute) {
            return this.primaryAttribute;
          }
          if (this.attributes.length > 0) {
            angular.forEach(this.attributes, function (value) {
              if (value.primary) {
                this.primaryAttribute = value;
                return value;
              }
            }, this);
          }

          if (this.name) {
            return new TagAttribute(this.attr, this.name, true);
          }

          return {};
        },

        /**
         * Returns the selector to retrieve the tag.
         *
         * @method
         * @returns {string} Selector string.
         */
        getSelector: function () {
          var primary = this.primaryAttribute || this.getPrimaryAttribute();
          return this.tagName + '[' + primary.name + '="' + primary.value + '"]';
        },

        /**
         * Gets the tag from the DOM.
         *
         * @method
         * @param {DOMElement} [context] DOM Element.
         * @param {boolean} fresh Whether to fetch a fresh tag from the DOM or use cached tag.
         * @returns {DOMElement} jQuery element.
         */
        getTag: function (context, fresh) {
          if (this.tag && !fresh) {
            return this.tag;
          }
          context = this.getContext(context);

          this.tag = context.querySelector(this.getSelector());
          return this.tag;
        },

        /**
         * Whether the tag exists in the DOM.
         *
         * @method
         * @param {DOMElement} [context] DOM Element.
         * @returns {boolean} Whether the tag exists.
         */
        exists: function (context) {
          if (this.allowDuplicates) {
            this._exists = false;
          } else {
            context = this.getContext(context);
            this._exists = !!context.querySelector(this.getSelector());
          }
          return this._exists;
        },

        /**
         * Creates the DOM element from `document`.
         *
         * @method
         */
        create: function () {
          this.tag = document.createElement(this.tagName);
        },

        /**
         * Takes a jQuery Lite (angular.element) action on a jQuery/Angular element.
         *
         * @method
         * @param {jQueryElement} $elem jQuery Element.
         * @param {string} action Action to take.
         * @param {*} value Value to append. Default: this.tag.
         */
        action: function($element, action, value) {
          if (!$element) {
            return false;
          }
          value = value ? value : this.tag;
          action = this._action ?  this._action : action;
          switch(action) {
            case 'prepend':
              $element.prepend(value);
              break;
            case 'after':
              $element.after(value);
              break;
            case 'before':
              $element.before(value);
              break;
            default:
              $element.append(value);
              break;
          }
        },

        /**
         * Conditionally appends the tag to the context.
         *
         * @method
         * @param {DOMElement} [context] DOM Element.
         * @returns {boolean} Whether the tag was appeneded to the DOM.
         */
        append: function (context) {
          var self = this;
          if (!this.exists()) {
            this.tag.onload = function () {
              self.exists();
            };
            context = this.getContext(context);
            if(context) {
              this.action(angular.element(context));
            } else {
              this.action(angular.element('body'));
            }
            return true;
          }
          return false;
        },

        /**
         * Adds attribute to a specific tag.
         *
         * @method
         * @param {string} attribute Attribute to add.
         * @param {string} value Value of the attribute.
         * @param {string} primary Whether the attribute is the primary attribute.
         */
        addAttribute: function (attribute, value, primary) {
          this.attributes.push(new TagAttribute(attribute, value));
        },

        /**
         * Sets the value of the tag attribute.
         *
         * @method
         * @param {string} name Attribute to set.
         * @param {string} value Value of the attribute.
         */
        setTagAttribute: function(name, value) {
          angular.forEach(this.attributes, function (val, index) {
            if (value.name === name) {
              val.value = value;
            }
          });
        },

        /**
         * Sets an attribute's value on a tag.
         *
         * @description This currently does not ensure that this.attributes is parallel
         *
         * @method
         * @param {string} name Attribute's name.
         * @param {string} value Value of the attribute.
         */
        setAttribute: function (name, value) {
          if (!this.tag) {
            this.create();
          }
          if (TWC.PcoUtils.isElement(this.tag)) {
            this.tag.setAttribute(name, value);
          }
          this.setTagAttribute(name, value);
        },

        /**
         * Set attributes on an HTML tag.
         *
         * @method
         */
        setAttributes: function () {
          angular.forEach(this.attributes, function (value, key) {
            if (twcUtil.isObject(value)) {
              this.setAttribute(value.name, value.value);
            } else if (twcUtil.isString(value) && twcUtil.isString(key)) {
              this.setAttribute(key, value);
            }
          }, this);
        },

        /**
         * Add tag to the DOM.
         *
         * @method
         * @param {DOMElement} [context] DOM Element.
         */
        addToDOM: function (context) {
          if (this.exists() || this._exists) {
            return new Error('Element already exists.');
          }
          context = this.getContext(context);

          // Create DOM element
          !this.tag && this.create();
          this.setAttributes();

          // Only append to DOM if it does not exist
          this._added = this.append(context);
        }
      };

      /**
       * Head Tag class
       *
       * @classdesc Tag that belongs to the `<head>` tag.
       *
       * @constructor
       * @augments Tag
       * @memberof TagBuilder
       *
       * @param {string} name Name of the tag (e.g., link, title, meta).
       * @param {?object[]} attributes Array of attribute objects.
       */
      function HeadTag(name, attributes) {
        Tag.call(this, name, attributes);
      }

      // HeadTag prototype
      HeadTag.prototype = {};
      angular.extend(HeadTag.prototype, Tag.prototype, {
        _action: 'prepend',

        /**
         * Gets the Head Tag from the DOM.
         *
         * @method
         * @memberof HeadTag
         *
         * @param {boolean|any} fresh Whether to get the a fresh Head Tag from the DOM or use cached one.
         * @returns {DOMElement} Head Tag from the DOM.
         */
        getHeadTag: function (fresh) {
          if (!this.head || fresh) {
            this.head = document.getElementsByTagName('head')[0];
          }

          return this.head;
        },

        /**
         * Context of the DOM. Defaults to head tag or document.
         *
         * @see this.getHeadTag()
         *
         * @method
         * @memberof HeadTag
         *
         * @param context DOM context element.
         * @returns {DOMElement} Document or Head tag.
         */
        getContext: function (context) {
          this.context = context || this.getHeadTag() || document;

          return this.context;
        },

        /**
         * Conditionally appends the tag to the context.
         *
         * @method
         * @memberof HeadTag
         *
         * @param {DOMElement} [context] DOM Element.
         * @returns {boolean} Whether the tag was appeneded to the DOM.
         */
        __append: function (context) {
          var self = this;
          if (!this.exists()) {
            this.tag.onload = function () {
              self.exists();
            };
            context = this.getContext(context);
            if(context) {
              this.action(angular.element(context));
            } else {
              this.action(angular.element(this.getUtfTag()), 'after');
            }
            return true;
          }
          return false;
        }
      });

      /**
       * Meta Tag class
       *
       * @constructor
       * @augments Tag
       * @augments HeadTag
       *
       * @param {?string} type Type of meta tag (e.g., og, twitter, fb, al, etc.).
       * @param {string} name Name of the meta tag (e.g., url, image, video, etc.).
       * @param {?string|mixed} value Fallback value, if no value is set.
       * @param {?object[]} attributes Value or value to override the fallback.
       */
      function HeadMetaTag(type, name, value, attributes) {
        attributes = attributes || null;
        HeadTag.call(this, name, attributes);
        this.type = type;
        this.name = name;
        this.tagName = 'meta';
        //this.fallback = fallback || null;
        this.override = value || null;
        this.allowed = this.isAllowed();
        this.head = this.getHeadTag();
      }

      HeadMetaTag.prototype = {};
      angular.extend(HeadMetaTag.prototype, HeadTag.prototype, {
        allowedProperties: [],
        // First attribute
        attr: 'name',
        // Content value
        content: null,
        // Fallback value
        fallback: null,
        // Override value
        override: null,
        // Type of tag
        tagName: 'meta',
        // Type of tag (e.g., og, twitter, fb, al)
        type: null,

        /**
         * Builds a selector string based on attr and property name (e.g., [name="og:url"])
         *
         * @method
         * @memberof HeadMetaTag
         * @see this.getPropertyName()
         * @returns {string}
         */
        getSelector: function () {
          return this.tagName + '[' + this.attr + '="' + this.getPropertyName() + '"]';
        },

        /**
         * Builds the meta property/name value based on type and name (e.g., og:url).
         *
         * If type does not exist, then returns the name of the meta.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {string} Property/name value (e.g., og:url)
         */
        getPropertyName: function () {
          if (this.name.indexOf(':') > -1) {
            return this.name;
          } else if (this.type) {
            return this.type + ':' + this.name;
          }
          return this.name;
        },

        /**
         * Gets the meta DOM element.
         *
         * @param {DOMElement} [context] Context to get the tag (defaults to <head>)
         * @param {boolean} fresh Whether to get a fresh version of the head tag.
         * @returns {DOMElement} Meta DOM element.
         */
        getMeta: function (context, fresh) {
          return this.getTag(context, fresh);
        },

        /**
         * Sets meta attributes (name/property & content).
         *
         * @see this.append()
         * @see this.setAttribute()
         */
        setMeta: function () {
          if (!this.tag) {
            this.append();
          }
          this.setAttribute(this.attr, this.getPropertyName());
          this.setAttribute('content', this.content || this.getContent());
          this.setAttribute('updated', 'PageMetaTags');
        },

        /**
         * Updates certain meta tags.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {boolean}
         */
        update: function () {
          if (!this.attr || !this.name) {
            return false;
          }
          this.setMeta();
          this._updated = true;
        },

        /**
         * Initializes the Meta Tag.
         *
         * If the tag is of an allowed schema, it sets the content attribute
         * and if it does not exist, it creates and adds the tag to the DOM.
         * Finally, if there is an override value, it will ensure that the
         * override value is present.
         *
         * @see this.isAllowed()
         * @see this.setContent()
         * @see this.addToDOM()
         * @see this.maybeOverride()
         *
         * @method
         * @memberof HeadMetaTag
         */
        init: function () {
          if (this.isAllowed()) {
            this.setContent();
            if (!this.exists()) {
              this.addToDOM();
            }
            this.maybeOverride();
          }
        },

        /**
         * Gets the CURRENT fresh content attribute of the meta tag from the DOM.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {string} Value of the content attribute.
         */
        getCurrentContent: function () {
          return angular.element(this.getMeta()).attr('content');
        },

        /**
         * Conditionally sets the content value of the object.
         *
         * It does not set the value of the meta tag. To do that, use
         * this.update()
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @param override
         */
        setContent: function (override) {
          var content;
          override = override || this.override;
          if (override) {
            this.content = override;
            this.isoverride = true;
            this.isfallback = false;
          } else if (content = this.getCurrentContent()) {
            this.content = content;
            this.isoverride = false;
            this.isfallback = false;
          } else {
            this.content = this.fallback;
            this.isoverride = false;
            this.isfallback = false;
          }
        },

        /**
         * Gets the content, ensuring that the content attribute is the
         * same as the override value, if present.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @param {string} override
         * @returns {string|null} Value of the content attribute.
         */
        getContent: function (override) {
          override = override || this.override;
          //this.content = override ||
          //  this.getCurrentContent() ||
          //  this.fallback;
          this.setContent(override);
          return this.content;
        },

        /**
         * Gets the allowed schema property or meta name from metaSchema.
         *
         * @see socialConstants
         * @see typeProperties
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @param {string} property Value of the property (e.g., url)
         * @returns {Array} Array of allowed properties.
         */
        getAllowedProperties: function (property) {
          this.allowedProperties = typeProperties[this.type] || [];
          return this.allowedProperties;
        },

        /**
         * Determines whether the property/name attribute is allowed or not.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {boolean} Whether the property/name attribute is allowed.
         */
        isAllowed: function () {
          var allowedProperties = this.getAllowedProperties(),
            index;

          if (twcUtil.isEmpty(allowedProperties)) {
            return true;
          }

          index = allowedProperties.indexOf(this.name);
          this.allowed = (this.name === this.allowedProperties[index]);
          return this.allowed;
        },
        isFallback: function () {
          if (!this.content) {
            this.setContent();
          }
          return this.isfallback;
        },

        /**
         * Determines whether we are using the override value.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {boolean} Whether the content attribute is the override value.
         */
        isOverride: function () {
          return !!(this.override && '' + this.override !== this.getCurrentContent());
        },

        /**
         * Conditionally overrides the value of the content attribute.
         *
         * @method
         * @memberof HeadMetaTag
         *
         * @returns {*|boolean} Whether we used the override value.
         */
        maybeOverride: function () {
          var doOverride = this.isOverride();
          if (doOverride) {
            this.update();
          }
          return doOverride;
        }
      });

      /**
       * Public API
       *
       */
      return {

        TagAttribute: TagAttribute,
        Tag: Tag,
        HeadTag: HeadTag,
        HeadMetaTag: HeadMetaTag

      };

    }
  ]);

})(TWC, angular, twc, document);
;
/**
 * @ngdoc service
 * @name bitly
 * @description
 * _Please update the description and dependencies._
 *
 * */
(function (angular, twc) {
  'use strict';
  twc.shared.apps
    .factory('bitly', ['$http', '$q', 'twcUtil',
      function Bitly($http, $q, twcUtil) {
        var baseUrl = 'https://api-ssl.bitly.com',
          domain = 'wxch.nl',
          token = '7593fd3da379f2972e4ed6448cf0da3b6b595ebc';

        var bitly = {};

        /**
         * Determines whether the shorturl exists.
         *
         * @param {string} url URL.
         */
        bitly.urlExists = function(url) {
          var params = {
            url: url,
            access_token: token
          };
          return $http.get(baseUrl + '/v3/link/lookup?' + twcUtil.toQueryString(params))
            .then(function(response) {
              var data = TWC.PcoUtils.getter(response, 'data.data.link_lookup'); // response.data.data.link_lookup;
              if (!data || data && data[0].error) {
                return false;
              } else if (data && data[0].aggregate_link) {
                return data[0].aggregate_link;
              }
            });
        };

        /**
         * Shortens a long URL.
         *
         * @param {string} url URL to be shortened.
         * @returns {promise} Promise to shortened url.
         */
        bitly.createShortUrl = function(url) {
          var params = {
            longUrl: url,
            domain: domain,
            access_token: token
          };
          return $http.get(baseUrl + '/v3/shorten?' + twcUtil.toQueryString(params))
            .then(function(response){
              // have to replace bit.ly with {domain} because the {domain} only works for https://weather.com
              var url = TWC.PcoUtils.getter(response, 'data.data.url');
              if (url) {
                return url.replace('bit.ly', domain);
              } else {
                return '';
              }
            });
        };

        /**
         * returns shortened URL.
         *
         * @param {string} url URL to be shortened.
         * @returns {Deferred.promise}
         */
        bitly.getShortUrl = function(url) {
          var deferred = $q.defer();

          bitly.urlExists(url)
            .then(function(response) {
              if(response) {
                deferred.resolve(response);
              } else {
                bitly.createShortUrl(url)
                  .then(function(response){
                    deferred.resolve(response);
                  });
              }
            });

          return deferred.promise;
        };

        return bitly;

      }]);
})(angular, twc);
;
/**
 * User: Travis Smith
 *
 * This is served as a shared service for assisting with adding meta tags for Windows, Open Graph, Twitter, Google, Facebook and Schema.
 */
(function (angular, twc) {
  'use strict';

  /**
   * @ngdoc service
   * @name shared.GlomoSocialMetaTags
   * @description
   *  Assists with adding meta tags for Windows, Open Graph, Twitter,
   *  Google, Facebook, and schema.
   */
  twc.shared.apps.factory('GlomoSocialMetaTags', ['TagBuilder', 'twcConstant', 'twcUtil',
    function GlomoSocialMetaTags(TagBuilder, twcConstant, twcUtil) {
      /** @namespace GlomoSocialMetaTags */

      /**
       * Windows Meta Head Tag
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function WindowsMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, null, name, value);
        this.attr = 'name';
        this.allowDuplicates = true;
        this.init();
      }

      WindowsMetaTag.prototype = {};
      angular.extend(WindowsMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * Twitter Meta Tags
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function TwitterMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, 'twitter', name, value);
        this.attr = 'name';

        this.init();
      }

      TwitterMetaTag.prototype = {};
      angular.extend(TwitterMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * Google Plus Meta Tags (Schema itemprop).
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function GooglePlusMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, null, name, value);
        this.attr = 'itemprop';

        this.init();
      }

      GooglePlusMetaTag.prototype = {};
      angular.extend(GooglePlusMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * Schema (itemtype) Meta Tags.
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function SchemaMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, null, name, value);
        this.attr = 'itemtype';

        this.init();
        this.addAttribute('itemscope', '');
      }
      SchemaMetaTag.prototype = {};
      angular.extend(SchemaMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * Open Graph Meta Tags
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function OgMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, 'og', name, value);
        this.attr = 'property';

        this.init();
      }

      OgMetaTag.prototype = {};
      angular.extend(OgMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * Facebook Meta Tags
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {?string} value Value of the attribute.
       */
      function FacebookMetaTag(name, value) {
        TagBuilder.HeadMetaTag.call(this, 'fb', name, value);
        this.attr = 'property';

        this.init();
      }

      /**
       *
       * @constructor
       * @memberof GlomoSocialMetaTags
       * @augments Tag
       * @augments HeadTag
       * @augments HeadMetaTag
       *
       * @param {string} name Name of the attribute.
       * @param {string} value Value of the attribute.
       */
      FacebookMetaTag.prototype = {};
      angular.extend(FacebookMetaTag.prototype, TagBuilder.HeadMetaTag.prototype);

      /**
       * App Twitter Meta Tags
       *
       * @constructor
       *
       * @param {string} device Device (e.g., iphone, ipad, etc.).
       * @param {object} args Args for creating the Twitter Meta Tag.
       * @param {object} args.name Name of the App.
       * @param {object} args.id ID of the App.
       * @param {object} args.url Url of the App.
       */
      function AppTags(device, args) {
        this['app:name:' + device] = new TwitterMetaTag('app:name:' + device, args.name);
        this['app:id:' + device] = new TwitterMetaTag('app:id:' + device, args.id);
        this['app:url:' + device] = new TwitterMetaTag('app:url:' + device, args.url);
      }

      /**
       * Meta Tags object.
       * @constructor
       * @memberof GlomoSocialMetaTags
       */
      function MetaTags() {

        /**
         * @memberof MetaTags
         * @type {object|TwitterMetaTag|FacebookMetaTag|OgMetaTag|SchemaMetaTag|GooglePlusMetaTag|WindowsMetaTag}
         */
        Object.defineProperty(this, 'tags', {
          value: null,
          enumerable: true,
          writable: true
        });

      }

      MetaTags.prototype = {};
      angular.extend(MetaTags.prototype, {
        // http://schema.org Constant
        schema: twcConstant.microdata.schema,

        /**
         * Helper function to instantiate & store the proper class.
         *
         * @private
         * @method
         * @memberof MetaTags
         *
         * @param {?string} type Type of tag (creates "[type]:WHATEVER" attribute value).
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        _add: function (type, name, value, attributes) {
          var tag, tagName = [type, name].join(':');
          switch (type) {
            case 'fb':
              tag = new FacebookMetaTag(name, value, attributes);
              break;
            case 'googleplus':
              tag = new GooglePlusMetaTag(name, value, attributes);
              break;
            case 'og':
              tag = new OgMetaTag(name, value, attributes);
              break;
            case 'twitter':
              tag = new TwitterMetaTag(name, value, attributes);
              break;
            default:
              tagName = name;
              tag = new TagBuilder.HeadMetaTag('', name, value, attributes);
              break;
          }
          tag = tag.isAllowed() ? tag : null;

          if (tag) {
            this[tagName] = tag;
          }
        },
        /**
         * Adds Open Graph, Twitter, and Google Plus tags.
         * @method
         * @memberof MetaTags
         *
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        addOTG: function (name, value, attributes) {
          this.addOg(name, value, attributes);
          this.addTwitter(name, value, attributes);
          this.addGooglePlus(name, value, attributes);
        },
        /**
         * Adds Open Graph and Twitter tags
         *
         * @method
         * @memberof MetaTags
         *
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        addOT: function (name, value, attributes) {
          this.addOg(name, value, attributes);
          this.addTwitter(name, value, attributes);
        },
        /**
         * Adds Open Graph Tags
         *
         * @method
         * @memberof MetaTags
         *
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        addOg: function (name, value, attributes) {
          this._add('og', name, value, attributes);
        },
        /**
         * Adds Twitter Tags
         *
         * @method
         * @memberof MetaTags
         *
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        addTwitter: function (name, value, attributes) {
          this._add('twitter', name, value, attributes);
        },

        /**
         * Adds Google Plus Tags.
         *
         * @method
         * @memberof MetaTags
         *
         * @param {string} name Name of the Tag.
         * @param {?string|number} value Value of the content attribute.
         * @param {object[]} attributes Extra attributes.
         */
        addGooglePlus: function (name, value, attributes) {
          this._add('googleplus', name, value, attributes);
        },

        /**
         * Determines whether the Meta Tags object is empty.
         *
         * @method
         * @memberof MetaTags
         *
         * @returns {boolean} Determines whether the current tag is empty.
         */
        isEmpty: function () {
          return twcUtil.isEmpty(this.tags);
        }
      });

      return {
        WindowsMetaTag: WindowsMetaTag,
        TwitterMetaTag: TwitterMetaTag,
        GooglePlusMetaTag: GooglePlusMetaTag,
        SchemaMetaTag: SchemaMetaTag,
        OgMetaTag: OgMetaTag,
        FacebookMetaTag: FacebookMetaTag,
        AppTags: AppTags,
        MetaTags: MetaTags
      };
    }
  ]);
})(angular, twc);
;
/**
 * User: Tan Duong
 * Date: 12/29/2015
 * Time: 14:6
 */
/*jshint -W065 */

/* App Module */
angular.module('gm_locations', ['ngSanitize']);
;
/**
 * Author: ksankaran (Velu)
 * Date: 8/16/13
 * Time: 12:42 AM
 * Comments: TWC Library for parsing dsx date strings. The library provides multiple helpers like factory, directives,
 * etc to parse the date strings represented by DSX and format them based on the string format sent by user.
 */
/* global twc */
/* global Drupal */
/* global angular */
/*jshint -W065 */
/*jshint -W055 */
/*jscs:disable requireCapitalizedConstructors */
/**
 * The datefactory is a factory library that can be imported in any module to create dsxdate object. This contains
 * methods and logic to form date params and formatting options. It's not much complicated and is straightforward.
 * The date creation takes in DSX date, time and timezone strings. The string manipulation helps in splitting the
 * strings and figure out the date components such as year, month, etc. The format method, when invoked looks for
 * formats in the order and replaces them one by one.
 */
twc.shared.apps.factory('datefactory',['$locale', 'twcUtil', '$log', function ($locale, twcUtil, $log) {
  /**
   * The actual date object function.
   * @param dateStr - date string representation from DSX
   * @param timeStr - time string representation from DSX
   * @param tzStr - timezone abbreviation from DSX
   * @return dateObj - when called through new
   */
  var date = function (dateStr, timeStr, tzStr) {
    var self  = this;
    /*
     This function is a modified copy of angularJS date filter

     The MIT License

     Copyright (c) 2010-2012 Google, Inc. http://angularjs.org

     Permission is hereby granted, free of charge, to any person obtaining a copy
     of this software and associated documentation files (the "Software"), to deal
     in the Software without restriction, including without limitation the rights
     to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     copies of the Software, and to permit persons to whom the Software is
     furnished to do so, subject to the following conditions:

     The above copyright notice and this permission notice shall be included in
     all copies or substantial portions of the Software.

     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     THE SOFTWARE.
     */
    var formatter = (function () {
      var slice = [].slice, getPrefix;
      var uppercase = function (string) {return twcUtil.isString(string) ? string.toUpperCase() : string;};
      function concat(array1, array2, index) {
        return array1.concat(slice.call(array2, index));
      }

      function padNumber(num, digits, trim) {
        var neg = '';
        if (num < 0) {
          neg =  '-';
          num = -num;
        }
        num = '' + num;
        while (num.length < digits) {
          num = '0' + num;
        }
        if (trim) {
          num = num.substr(num.length - digits);
        }
        return neg + num;
      }

      function dateGetter(name, size, offset, trim) {
        offset = offset || 0;
        return function (date) {
          var value = date[getPrefix + name]();
          if (offset > 0 || value > -offset) {
            value += offset;
          }
          if (value === 0 && offset === -12) {
            value = 12;
          }
          return padNumber(value, size, trim);
        };
      }

      function dateStrGetter(name, shortForm) {
        return function (date, formats) {
          var value = date[getPrefix + name]();
          var get = uppercase(shortForm ? ('SHORT' + name) : name);

          return formats[get][value];
        };
      }

      function timeZoneGetter(date) {
        var zone = -1 * date.getTimezoneOffset();
        var paddedZone = (zone >= 0) ? '+' : '';

        paddedZone += padNumber(Math[zone > 0 ? 'floor' : 'ceil'](zone / 60), 2) +
          padNumber(Math.abs(zone % 60), 2);

        return paddedZone;
      }

      function timeZoneStrGetter() {
        return self.tz;
      }

      function ampmGetter(date, formats) {
        return (date[getPrefix + 'Hours']() < 12 ? formats.AMPMS[0] : formats.AMPMS[1]).toLowerCase();
      }

      function AMPMGetter(date, formats) {
        return ampmGetter(date, formats).toUpperCase();
      }

      /**
       * DEVELOPERS PLEASE NOTE: ALL THE FORMATTERS DOWN HERE ARE VERY GENERIC. IF YOU ARE TO ADD NEW FORMATTER,
       * DON'T ADD FORMATS THAT IS TOO **COMPLEX** OR TOO **SPECIFIC**.
       */
      var DATE_FORMATS = {
        /**
         * 4 digit representation of year (e.g. AD 1 => 0001, AD 2010 => 2010)
         */
        yyyy: dateGetter('FullYear', 4),
        /**
         * 2 digit representation of year, padded (00-99). (e.g. AD 2001 => 01, AD 2010 => 10)
         */
        yy: dateGetter('FullYear', 2, 0, true),
        /**
         * 1 digit representation of year, e.g. (AD 1 => 1, AD 199 => 199)
         */
        y: dateGetter('FullYear', 1),
        /**
         * Month in year (January-December)
         */
        MMMM: dateStrGetter('Month'),
        /**
         * Month in year (Jan-Dec)
         */
        MMM: dateStrGetter('Month', true),
        /**
         * Month in year, padded (01-12)
         */
        MM: dateGetter('Month', 2, 1),
        /**
         * Month in year (1-12)
         */
        M: dateGetter('Month', 1, 1),
        /**
         * Day in month, padded (01-31)
         */
        dd: dateGetter('Date', 2),
        /**
         * Day in month (1-31)
         */
        d: dateGetter('Date', 1),
        /**
         * Hour in day, padded (00-23)
         */
        HH: dateGetter('Hours', 2),
        /**
         * Hour in day (0-23)
         */
        H: dateGetter('Hours', 1),
        /**
         * Hour in am/pm, padded (01-12)
         */
        hh: dateGetter('Hours', 2, -12),
        /**
         * Hour in am/pm, (1-12)
         */
        h: dateGetter('Hours', 1, -12),
        /**
         * Minute in hour, padded (00-59)
         */
        mm: dateGetter('Minutes', 2),
        /**
         * Minute in hour (0-59)
         */
        m: dateGetter('Minutes', 1),
        /**
         * Second in minute, padded (00-59)
         */
        ss: dateGetter('Seconds', 2),
        /**
         * Second in minute (0-59)
         */
        s: dateGetter('Seconds', 1),
        /**
         * Millisecond in second, padded (000-999)
         */
        sss: dateGetter('Milliseconds', 3),
        /**
         * Day in Week,(Sunday-Saturday)
         */
        EEEE: dateStrGetter('Day'),
        /**
         * Day in Week, (Sun-Sat)
         */
        EEE: dateStrGetter('Day', true),
        /**
         * am pm in lower case
         */
        a: ampmGetter,
        /**
         * AM PM in upper case
         */
        A: AMPMGetter,
        /**
         * time zone offset, from -1200 to +1200
         */
        Z: timeZoneGetter,
        /**
         * time zone name. ex: PST, EST
         */
        z: timeZoneStrGetter
      };

      var DATE_FORMATS_SPLIT = /((?:[^yMdHhmsaAZzE']+)|(?:'(?:[^']|'')*')|(?:E+|y+|M+|d+|H+|h+|m+|s+|a|A|Z|z))(.*)/,
        NUMBER_STRING = /^\d+$/;

      return (function () {

        var R_ISO8601_STR = /^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d)(?::?(\d\d)(?::?(\d\d)(?:\.(\d+))?)?)?(Z|([+-])(\d\d):?(\d\d))?)?$/;
        // 1        2       3         4          5          6          7          8  9     10      11
        function jsonStringToDate(string) {
          var match = string.match(R_ISO8601_STR);
          if (match) {
            var date = new Date(0),
              tzHour = 0,
              tzMin  = 0,
              dateSetter = match[8] ? date.setUTCFullYear : date.setFullYear,
              timeSetter = match[8] ? date.setUTCHours : date.setHours;

            if (match[9]) {
              tzHour = int(match[9] + match[10]);
              tzMin = int(match[9] + match[11]);
            }
            dateSetter.call(date, int(match[1]), int(match[2]) - 1, int(match[3]));
            var h = int(match[4] || 0) - tzHour;
            var m = int(match[5] || 0) - tzMin;
            var s = int(match[6] || 0);
            var ms = Math.round(parseFloat('0.' + (match[7] || 0)) * 1000);
            timeSetter.call(date, h, m, s, ms);
            return date;
          }
          return string;
        }

        return function (date, format) {
          var text = '',
            parts = [],
            fn, match;

          // set the getPrefix.
          getPrefix = (self.nativeDate ? 'get' : 'getUTC');
          format = format || 'mediumDate';
          format = $locale.DATETIME_FORMATS[format] || format;
          if (twcUtil.isString(date)) {
            if (NUMBER_STRING.test(date)) {
              date = int(date);
            } else {
              date = jsonStringToDate(date);
            }
          }

          if (twcUtil.isNumber(date)) {
            date = new Date(date);
          }

          if (!twcUtil.isDate(date)) {
            return date;
          }

          while (format) {
            match = DATE_FORMATS_SPLIT.exec(format);
            if (match) {
              parts = concat(parts, match, 1);
              format = parts.pop();
            } else {
              parts.push(format);
              format = null;
            }
          }

          twcUtil.each(parts, function (value) {
            fn = DATE_FORMATS[value];
            text += fn ? fn(date, $locale.DATETIME_FORMATS) : value.replace(/(^'|'$)/g, '').replace(/''/g, '\'');
          });

          return text;
        };
      })();
    })();

    this.format = function (format) {
      return formatter(this.nativeDate || this.toUTCDateObject(), format);
    };

    this.toUTCDateObject = function () {
      return new Date(Date.UTC(this.year, this.month - 1, this.day, this.hour || 0, this.minute || 0, this.second || 0, 0));
    };

    this.toDateObject = function () {
      return new Date(this.year, this.month - 1, this.day, this.hour || 0, this.minute || 0, this.second || 0, 0);
    };

    this.getDayOfWeek = function () {
      return new Date(this.year, this.month - 1, this.day).getDay();
    };

    // Override toString on base class to provide meaningful output.
    this.toString = function () {
      return 'DSXDate Object: ' + this.date + ' - ' + this.time + ' - ' + this.tz;
    };

    this.nativeDate = angular.isDate(dateStr) && dateStr;
    this.tz = String(tzStr || '');
    if (!this.nativeDate) {
      this.date = String(dateStr || '');
      this.time = String(timeStr || '');

      if (this.date && this.date.length === 8) {
        this.year   = parseInt(this.date.substring(0, 4), 10);
        this.month  = parseInt(this.date.substring(4, 6), 10);
        this.day    = parseInt(this.date.substring(6), 10);
      }

      if (this.time) {
        var hourVal   = parseInt(this.time.substring(0, 2), 10),
            minuteVal = parseInt(this.time.substring(2, 4), 10),
            secondVal = parseInt(this.time.substring(4), 10);
        this.hour     = (!isNaN(hourVal) ? hourVal : undefined);
        this.minute   = (!isNaN(minuteVal) ? minuteVal : undefined);
        this.second   = (!isNaN(secondVal) ? secondVal : undefined);
      }
    }
  };

  /**
   * Check params and invoke new method the date function.
   * @param dateStr
   * @param [timeStr]
   * @param [tzStr]
   * @returns {date | null}
   */
  function getDateObject(dateStr, timeStr, tzStr) {
    try {
      return new date(dateStr, timeStr, tzStr);
    }catch (err) {
      $log.error(err);
    }
    return null;
  }

  /**
   * Expose the only method that makes sense to the user - that helps user in creating the dsxdate object.
   * @type {{new: Function}}
   */
  var ret = {
    'new': function () {
      // if the first argument is a date object, then we don't need timeStr
      if (arguments[0] && angular.isDate(arguments[0])) {
        return getDateObject(arguments[0], null, arguments[1]);
      }

      var dateStr, timeStr, tzStr;
      if (arguments.length <= 2) {
        if (!isNaN(arguments[0])) {
          dateStr = arguments[0].toString().slice(0, 8);
          timeStr = arguments[0].toString().slice(8);
          tzStr   = arguments[1];
        } else {
          var match_parts = arguments[0].match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
          if (match_parts && match_parts.length >= 7) {
            dateStr = match_parts[1] + match_parts[2] + match_parts[3];
            timeStr = match_parts[4] + match_parts[5] + match_parts[6];
            tzStr   = arguments[1];
          }
        }
      } else if (arguments.length === 3) {
        dateStr = arguments[0];
        timeStr = arguments[1];
        tzStr   = arguments[2];
      }
      return getDateObject(dateStr, timeStr, tzStr);
    }
  };

  return ret;
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 10/21/13
 * Time: 3:54 PM
 *
 */
twc.shared.apps.run(['$locale',function ($locale) {
  $locale.DATETIME_FORMATS.dsxShortDate = 'MMM, d';
  $locale.DATETIME_FORMATS.dsxLongDate = 'EEEE, MMM d';
  $locale.DATETIME_FORMATS.dsxMedium = 'MMM d, yyyy, h:mma z';
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 7/8/14
 * Time: 4:45 PM
 * Comments:
 */

twc.shared.apps.directive('twcFbShare', ['twcConstant', function (twcConstant) {
    'use strict';

    return {
      scope: true,
      replace: false,
      transclude: false,
      controller: ['$scope', '$element', '$attrs','customEvent', function ($scope, $element, $attrs,customEvent) {
        $element.bind('click', function () {
          customEvent.getEvent('socialApiLoaded').done(function () {
            var currentProtocol = window.location.protocol.indexOf('http:') !== -1 ? 'http://' : 'https://';

            if (!$attrs.fbDescription) {
              $attrs.fbDescription = 'Visit www.weather.com for continuing coverage.';
            }

            if ($attrs.twcFbShare.indexOf('http://') < 0 && $attrs.twcFbShare.indexOf('https://') < 0) {
              // for a full qualified url
              $attrs.twcFbShare = currentProtocol + window.location.hostname + $attrs.twcFbShare;
            }

            var act = new gigya.socialize.UserAction();
            act.setTitle($attrs.fbTitle);
            act.setSubtitle($attrs.fbCaption || (currentProtocol + 'www.weather.com'));
            act.setLinkBack($attrs.twcFbShare);

            gigya.socialize.postBookmark({
              provider: 'facebook',
              url: $attrs.twcFbShare,
              title: $attrs.fbTitle,
              cid:$attrs.fbCid,
              shortURLs: 'always',
              thumbnailURL: $attrs.fbPicture || twcConstant.assetsUrl + '240x180_twc_default.png',
              userAction:act
            });

          });

          return false;
        });
      }]
    };
  }]).directive('twcGplusShare', function () {
    'use strict';

    return {
      scope: true,
      replace: false,
      transclude: false,
      controller: ['$scope', '$element', '$attrs','customEvent', function ($scope, $element, $attrs,customEvent) {
        $element.bind('click', function () {
          customEvent.getEvent('socialApiLoaded').done(function () {
            var currentProtocol = window.location.protocol.indexOf('http:') !== -1 ? 'http://' : 'https://';

            if ($attrs.twcGplusShare.indexOf('http://') < 0 && $attrs.twcGplusShare.indexOf('https://') < 0) {
              // for a full qualified url
              $attrs.twcGplusShare = currentProtocol + window.location.hostname + $attrs.twcGplusShare;
            }

            gigya.socialize.postBookmark({
              provider: 'googleplus',
              url: $attrs.twcGplusShare,
              cid:$attrs.twcGplusCid,
              shortURLs: 'never'
            });

          });
          return false;
        });
      }]
    };
  }).directive('twcTwShare', function () {
    'use strict';
    return {
      scope: true,
      replace: false,
      transclude: false,
      controller: ['$scope', '$element', '$attrs', 'customEvent',function ($scope, $element, $attrs,customEvent) {
        $element.bind('click', function () {
          customEvent.getEvent('socialApiLoaded').done(function () {
            var currentProtocol = window.location.protocol.indexOf('http:') !== -1 ? 'http://' : 'https://';

            if ($attrs.twcTwShare.indexOf('http://') < 0 && $attrs.twcTwShare.indexOf('https://') < 0) {
              // for a full qualified url
              $attrs.twcTwShare = currentProtocol + window.location.hostname + $attrs.twcTwShare;
            }

            gigya.socialize.postBookmark({
              provider: 'twitter',
              title: $attrs.twTitle + '&via=weatherchannel',
              cid:$attrs.twcTwCid,
              url: $attrs.twcTwShare,
              shortURLs: 'always'
            });
          });
          return false;
        });
      }]
    };
  });
;
(function () {
  'use strict';
  twc.shared.apps.factory('PageIdentifier', ['$window', function ($window) {

    // return the page content type
    function getPageId(contentType) {
      var pageId;
      var path, res;

      switch (contentType) {
        case 'video':
          path = $window.location.pathname;
          res = path.split('/');
          var secondToLast = res[res.length - 2];
          // check video-standalone, video-watch and video-watch-playlist
          if (secondToLast === 'player') {
            pageId = 'video-standalone';
          } else {
            var urlParams = $window.location.search.substring(1);
            if (urlParams.match('pl=')) {
              pageId = 'video-watch-playlist';
            } else {
              pageId = 'video-watch-collection';
            }
          }
          break;
        case 'article':
          pageId = 'article-watch';
          break;
        case 'index':
          pageId = 'collection-index';
          break;
        case 'homepage':
          pageId = 'homepage';
          break;
        case 'other':
          // check video-collection, video-index, article-collection and article-index
          path = $window.location.pathname;
          res = path.split('/');
          var firstPath = res[1];
          var lastPath = res[res.length - 1];
          if (firstPath === 'series' && lastPath === 'video') {
            pageId = 'video-collection';
          } else if (lastPath === 'video') {
            pageId = 'video-index';
          } else if (firstPath === 'series' && lastPath === 'news') {
            pageId = 'article-collection';
          } else if (lastPath === 'news') {
            pageId = 'article-index';
          }
          break;
        default:
          pageId = '';
      }

      return pageId;
    }

    return {
      getPageId: getPageId
    };

  }]);
})();
;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 9/30/13
 * Time: 10:03 AM
 * To change this template use File | Settings | File Templates.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('MouseBroadcast',['$rootScope', function ($rootScope) {
  'use strict';
  var location = null,
    lastLocation = null;

  var api = {
    /**
     * returns a copy of current mouse location
     * @returns {Object}
     */
    getLocation: function () {
      return angular.copy(location);
    },

    /**
     * Keep a copy of current mouse location in lastLocation, then create a new location object with the given x, y
     * @param x
     * @param y
     */
    setLocation: function (scope, attrs, evt) {
      if (location) {
        lastLocation = location;
      }
      location = {
        x: evt.pageX,
        y: evt.pageY
      };
      var event = attrs.eventName ? attrs.eventName + '-' + evt.type + '-broadcast' : evt.type + '-broadcast';
      $rootScope.$broadcast(event, this.getLocation());
    }
  };
  return api;
}]);
;
angular.module('twc_dal', []);
;
/**
 * This service provides a generic way to create Locations
 */
/* global twc */
/*jshint -W065 */

angular.module('gm_locations').factory('gmLocations', ['gmLocationsDatasource', 'gmLocationsPco',
  'gmLocationsMigration', 'gmLocationsModals', 'gmLocationsCookies',
  'gmLocationsRecentLocations', 'gmLocationsSavedLocations',
  'gmLocationsTemporaryLocations',
  function (gmLocationsDatasource, gmLocationsPco,
            gmLocationsMigration, gmLocationsModals, gmLocationsCookies,
            gmLocationsRecentLocations, gmLocationsSavedLocations,
            gmLocationsTemporaryLocations) {
    'use strict';


    /**********************************************
     *
     * Public API
     */
    return {
      //setSettings: gmLocationsPco.setSettings,

      /***
       * Datasources
       */
      pcoDatasource: {
        savedLocations: {
          removeAll: gmLocationsPco.savedLocations.removeAll
        },
        isLoggedIn: gmLocationsPco.isLoggedIn
      },

      /***
       * Locations UI Services
       */
      savedLocations: gmLocationsSavedLocations,
      recentLocations: gmLocationsRecentLocations,
      temporaryLocations: gmLocationsTemporaryLocations,

      /***
       * UI Component Services
       */
      migration: gmLocationsMigration,
      modals: gmLocationsModals
    };

  }]);
;
/**
 * Created by josh.tepei on 2/16/16.
 */

angular.module('gm_locations').factory('gmLocationsMetrics', ['customEvent',
  function (customEvent) {
    'use strict';

    return {
      customEventNotify: customEventNotify
    };

    function customEventNotify(trackString, rootScope) {
      customEvent.getEvent('track-string-event').notify({
        settings: rootScope.settings,
        trackStr: trackString
      });
    }

  }
]);
;
/**
 * This service provides a generic way to create Locations
 */
/*jshint -W065 */

angular.module('gm_locations').factory('gmLocationsDatasource', ['$q', 'pcoUser', 'gmLocationsDsx', 'twcUtil',
  function ($q, pcoUser, gmLocationsDsx, twcUtil) {
    'use strict';

    /**********************************************
     *
     * Private Properties
     */

    var endpointNames = {
      'wns-desktop': 'Windows Desktop',
      'adm': 'Kindle',
      'adm-ent': 'Kindle',
      'ipad-free': 'iPad',
      'ipadent-free': 'iPad',
      'iphone-free': 'iPhone',
      'iphone-max': 'iPhone',
      'iphoneent-free': 'iPhone',
      'smtp': 'Email',
      'gcm': 'Android',
      'gcm-ent': 'Android',
      'sms': 'Text',
      'wns-phone': 'Windows Phone'
    };

    var serviceNames = {
      'followme-rain': 'Real-Time Rain',
      'followme-lightning': 'Lightning Strikes',
      'followme-severe': 'National Weather Service',
      'cms-push/breakingnews': 'Breaking News',
      'cms-push/winterweathernews': 'Winter Weather Breaking News',
      'global8/NRF': 'Heavy Rainfall',
      'global8/NSF': 'Heavy Snowfall',
      'global8/NIC': 'Ice Forecast',
      'global8/NEH': 'High Heat',
      'global8/NEC': 'Very Cold',
      'global8/NHW': 'High Wind',
      'global8/NTS': 'Thunderstorm',
      'global8/NFG': 'Dense Fog',
      'severe': 'National Weather Service',
      'pollen': 'Pollen',
      'scheduled/curr': 'Current Conditions',
      'scheduled/excold': 'Extreme Cold',
      'scheduled/exheat': 'Extreme Heat',
      'scheduled/farmcast': 'Farmer\'s Forecast',
      'scheduled/fcst': 'Daily Forecast',
      'scheduled/icyprcp': 'Icy Precipitation',
      'scheduled/marine': 'Surf and Sea Conditions',
      'scheduled/outdoor': 'Outdoor Activity Forecast',
      'scheduled/pollen': 'Pollen',
      'scheduled/precip': 'Daily Rain/Snow',
      'scheduled/rain': 'Daily Rain',
      'scheduled/school': 'School Day Forecast',
      'scheduled/snow': 'Snow'
    };

    /**********************************************
     *
     * Public API
     */

    return {

      /***
       * CRUD operations
       */
      update: _update,
      save: _save,
      saveMany: _saveMany,
      updateMany: _updateMany,
      remove: _remove,
      getLocationEndpointsAlerts: _getLocationEndpointsAlerts
    };

    /**********************************************
     *
     * Private Functions
     */

    /***
     * Example DSX query
     * https://dsx.weather.com/p/locations/school?jsonp=angular.callbacks._9&put={"nickname":"SteveHome","loc":"33.97,-84.44"}
     */

    function getLocationModel(data) {
      var model = {};
      if (data.nickname) {
        model.nickname = data.nickname;
      }
      if (data.loc) {
        model.loc = data.loc;
      } else {
        model.loc = data.key;
      }
      if (data.tag) {
        model.tag = data.tag;
      }
      if (data.nickname) {
        model.nickname = data.nickname;
      }
      if (data.address) {
        model.address = data.address;
      }
      if (data.pos || data.position) {
        model.position = data.pos || data.position;
      }
      return model;
    }

    function getData(location) {
      return location.data || location;
    }

    function _update(location) {
      var data = getData(location);
      var locationModel = getLocationModel(data);
      return gmLocationsDsx.put('/p/locations/' + data.id, locationModel);
    }

    function _save(location) {
      var id = 'loc' + TWC.PcoUtils.generateUUID();
      var data = getData(location);
      data.id = id;
      var locationModel = getLocationModel(data);
      return gmLocationsDsx.put('/p/locations/' + id, locationModel);
    }

    function _saveMany(locations) {
      var queue = [];
      angular.forEach(locations, function (location) {
        var data = getData(location);
        queue.push(_save(data));
        // TODO: pcoUser.update(location);
      });
      return $q.all(queue);
    }

    function _updateMany(locations) {
      var queue = [];
      angular.forEach(locations, function (location) {
        queue.push(_update(location));
        // TODO: pcoUser.update(location);
      });
      return $q.all(queue);
    }

    function _remove(location) {
      var data = getData(location);
      return gmLocationsDsx.destroy('/p/locations/' + data.id);
    }

    function extractAlertId(alertId) {
      /***
       * Get all the parts before the ending 13 character ID.
       */
      // var regex = /^(.*)\/.{13}$/;

      /****
       * Get the first part separated by a slash, and discard the rest.
       */
      var regex = /^([^\/]*)\/.*$/;

      var matches = alertId.match(regex);
      if(matches && matches.length > 1) {
        return matches[1];
      }
      return alertId;
    }

    function getAlertName(alert) {
      var key = extractAlertId(alert.id);
      var product = alert.doc.product;
      var serviceName = serviceNames[key + '/' + product];
      if(serviceName) {
        return serviceName;
      }
      return twcUtil.capitalize(key);
    }

    function _getLocationEndpointsAlerts(location) {
      var locationId = getData(location).id;
      var que = $q.all({endpoints: _getEndpoints(), alerts: _getAlerts()});
      return que.then(function (data) {
        var alerts = _getAlertsByLocationId(data.alerts, locationId);
        var endpoints = data.endpoints;

        var _endpointsAlerts = [];
        angular.forEach(endpoints, function (endpoint) {
          var _alerts = [];
          angular.forEach(alerts, function (alert) {
            var endpointId = endpoint.id;
            var alertEndpointId = alert.doc.endpoint;
            if (alertEndpointId === endpointId) {
              var name = getAlertName(alert);
              _alerts.push({'name': name});
            }
          });
          if (_alerts.length > 0) {
            var key = endpoint.doc.chan;
            var name = endpointNames[key];
            _endpointsAlerts.push({'name': name, 'alerts': _alerts});
          }
        });

        return _endpointsAlerts;
      });
    }

    function _getAlertsByLocationId(alerts, locationId) {
      var locationAlerts = [];
      angular.forEach(alerts, function (alert) {
        if (locationId === alert.doc.location) {
          locationAlerts.push(alert);
        }
      });
      return locationAlerts;
    }

    function _getAlerts() {
      return gmLocationsDsx.get('/p/services');
    }

    function _getEndpoints() {
      return gmLocationsDsx.get('/p/endpoints');
    }
  }]);
;
/**
 * This service provides a generic way to create Locations
 */
/*jshint -W065 */


angular.module('gm_locations').factory('gmLocationsDsx', ['$http', '$q', 'twcUtil', 'customEvent',
  function ($http, $q, twcUtil, customEvent) {
    'use strict';

    var exports = {};

    exports.BASE_URL = TWC.Configs.dsx.hostReadWrite; //Production: "https://dsx.weather.com";
    exports.API_KEY = TWC.Configs.dsx.apiKey; //'7bb1c920-7027-4289-9c96-ae5e263980bc';

    // 2013-09-25 - Conditionally set BASE_URL to testing value
    // 2014-03-15 - added profile.qc to the test

    /*if (location.hostname === 'profile.odev.weather.com' || location.hostname === 'local.profile.weather.com') {
      //exports.BASE_URL = 'https://dsx-int.weather.com';
      exports.BASE_URL = 'https://dsx-stage.weather.com';
      //exports.API_KEY  = 'neoups';
    }*/

    var hasSession = false;
    var profileData = false;

    exports.head = function (path) {
      return authorizedRequest(path + '?jsonp=JSON_CALLBACK&head=');
    };

    exports.get = function (path) {
      return authorizedRequest(path + '?jsonp=JSON_CALLBACK');
    };
    exports.getWithParams = function (path) {
      return authorizedRequest(path + '&jsonp=JSON_CALLBACK');
    };
    exports.post = function (path, body) {
      var url = path + '?jsonp=JSON_CALLBACK&post=' + encodePayload(body);
      return authorizedRequest(url);
    };

    exports.put = function (path, body) {
      var url = path + '?jsonp=JSON_CALLBACK&put=' + encodePayload(body);

      return authorizedRequest(url);
    };

    exports.destroy = function (path) { // naming this "delete" breaks IE8
      return authorizedRequest(path + '?jsonp=JSON_CALLBACK&delete=true');
    };

    exports.deauthorize = function () {
      return exports.destroy('/dsx/session').then(forgetSession);
    };

    var authorizedRequest = function (url) {
      return checkSession()
        .then(null, createSession)
        .then(function () {
          return request(url);
        });
    };

    var checkSession = function () {
      // We have a DSX session, if, and only if, the dsx cookie exists,
      // and does not have a value of 'bye'; for performance reasons,
      // we only check this if we THINK we have a session, but want to
      // make sure...
      if (hasSession) { // we think we have a session, but let's make certain...
        var dsxCookieValue = jQuery.cookie('dsx');
        if (!dsxCookieValue || dsxCookieValue === 'bye') {
          hasSession = false; // if cookie missing or 'bye', session has expired/terminated
        }
      }

      // Now that we're sure about the value of hasSession, proceed...

      if (hasSession) {
        return $q.when();
      } else {
        return request('/p?jsonp=JSON_CALLBACK').then(
          function (data) {
            profileData = !twcUtil.isEmpty(data) ? data : false;
            rememberSession();
          });
      }
    };

    var createSession = function (url) {
      return request('/dsx/session?jsonp=JSON_CALLBACK&post=' + exports.API_KEY).then(rememberSession);
    };

    var rememberSession = function () {
      hasSession = true;
    };

    var forgetSession = function () {
      hasSession = false;
    };

    var request = function (url) {
      var deferred = $q.defer();

      if (profileData && url === '/p?jsonp=JSON_CALLBACK') {
        // Let's us reuse the p call.
        deferred.resolve(profileData);
      } else {
        /*
          When session timeout happened, although json.data.status is 401 or 419, but json.status is still 200
          $http will still execute successCallback, not errorCallback
        */
        $http.jsonp(exports.BASE_URL + url)
          .then(function (json) {
            // 401 indicates Unauthorized
            // 419 indicates Authentication Timeout
            if(json.data.status === 401 || json.data.status === 419){
              forgetSession();

              customEvent.getEvent('authentication-timeout-event').notify();
            }
            else{
              deferred.resolve(json.data.body);
            }
          }, function (json) {
            deferred.reject("Failed DSX request to " + url);
          });
      }
      return deferred.promise;
    };

    var encodePayload = function (payload) {
      payload = (angular.isObject(payload) ? angular.toJson(payload) : payload);
      return encodeURIComponent(payload);
    };

    return exports;
  }]);
;
/**
 * Created by josh.tepei on 2/16/16.
 */

angular.module('gm_locations')
  .factory('gmLocationsPco', ['$filter', '$injector', 'locUtil', 'PcoSavedLocationModel', 'twcPco', 'twcUtil',
    function ($filter, $injector, locUtil, PcoSavedLocationModel, twcPco, twcUtil) {
      'use strict';

      //var _settings, _moduleId;
      var XwebModelClass = $injector.has('XwebWebLocModelClass') && $injector.get('XwebWebLocModelClass');
      var WxdLocModelClass = $injector.has('WxdLocModelClass') && $injector.get('WxdLocModelClass');

      var _temporaryLocationsType = 'savedLocations';
      var _savedLocationsType = 'savedLocations';
      var _recentSearchType = 'recentSearchLocations';



      /************************************************************************************
       ************************************************************************************
       *
       * PUBLIC INTERFACE
       *
       */

      return {
        temporaryLocations: {
          getAll: getTemporaryLocations,
          remove: removeTemporaryLocation
        },
        savedLocations: {
          getAll: getSavedLocations,
          add: addSavedLocation,
          update: updateSavedLocation,
          remove: removeSavedLocation,
          removeAll: removeSavedLocations
        },
        recentLocations: {
          getAll: getRecentSearchLocations,
          add: addRecentSearchLocation,
          remove: removeRecentSearchLocation
        },
        createWxdLocModel: createWxdLocModel,
        isLoggedIn: twcPco.get('user').signedIn
      };



      /************************************************************************************
       ************************************************************************************
       *
       * PUBLIC FUNCTIONS
       *
       */

      /***
       * Temporary Locations
       */

      function getTemporaryLocations() {
        return getLocations(_temporaryLocationsType);
      }

      function removeTemporaryLocation(location) {
        /***
         * NOTE: This was using the type 'saveLocationLocations',
         * but that must have been a mistake.
         * Changed to _temporaryLocationsType.
         */
        removeLocation(location, _temporaryLocationsType);
      }

      /***
       * Saved Locations
       */

      function getSavedLocations() {
        return getLocations(_savedLocationsType);
      }

      function addSavedLocation(loc) {
        addLocation(loc, _savedLocationsType);
      }

      function updateSavedLocation(loc) {
        var location = createWxdLocModel(loc);
        if (location) {
          var savedLocs = twcPco.getNodeValue('user', _savedLocationsType);

          location = location.attrs ? location.attrs : location;
          location = location.data ? location.data : location;

          /***
           * if found, save the locs - completely.
           */
          if (savedLocs && angular.isArray(savedLocs)) {
            for (var idx = 0, len = savedLocs.length; idx < len; idx++) {
              if (locUtil.areLocationsEqual(location, savedLocs[idx])) {
                angular.extend(savedLocs[idx], location);
                savedLocs[idx].position = location.position;
                break;
              }
            }
          }
          /***
           * Persist change in localStorage
           */
          twcPco.setNodeValue('user', _savedLocationsType, savedLocs);
        }
      }

      function removeSavedLocation(location) {
        removeLocation(location, _savedLocationsType);
      }

      function removeSavedLocations() {
        return twcPco.get('user').removeSavedLocations();
      }

      /***
       * Recent Search Locations
       */

      function getRecentSearchLocations() {
        return getLocations(_recentSearchType);
      }

      function addRecentSearchLocation(loc) {
        addLocation(loc, _recentSearchType);
      }

      function removeRecentSearchLocation(location) {
        removeLocation(location, _recentSearchType);
      }



      /************************************************************************************
       ************************************************************************************
       *
       * PRIVATE FUNCTIONS
       *
       */

      /**********************************************
       *
       * Private Functions:
       * Cross-Location Type Functions
       */

      function getLocations(typeOfLocation) {
        /***
         * Type can be:
         * 'savedLocations'
         * 'RecentSearchLocations'
         */
        var locations = twcPco.getNodeValue('user', typeOfLocation) || [];
        var modeledLocations = twcUtil.map(locations, function (location) {
          var pcoSavedLocation = new PcoSavedLocationModel();
          return createModel(pcoSavedLocation.fromPcoData(location));
        });
        var orderedLocations = $filter('orderBy')(modeledLocations, 'data.position');
        return orderedLocations;
      }

      function addLocation(loc, type) {
        /***
         * Type can be:
         * 'savedLocations'
         * 'RecentSearchLocations'
         */
        if (loc) {
          var alreadySaved = false,
            currentLocs = twcPco.getNodeValue('user', type) || [],
            locObjArry = [],
            deleteType = (type === 'savedLocations') ? 'recentSearchLocations' : 'savedLocations';

          loc = loc.attrs ? loc.attrs : loc;
          loc = loc.data ? loc.data : loc;

          for (var i = 0, l = currentLocs.length; i < l; i++) {
            if (locUtil.areLocationsEqual(loc, currentLocs[i])) {
              alreadySaved = true;
              break;
            }
          }

          var deleteLocations = twcPco.getNodeValue('user', deleteType) || [];
          for (var idx = 0, len = deleteLocations.length; idx < len; idx++) {
            if (locUtil.areLocationsEqual(loc, deleteLocations[idx])) {
              if (deleteType === 'recentSearchLocations') {
                removeLocation(deleteLocations[idx], deleteType);
                break;
              } else {
                alreadySaved = true;
              }
            }
          }

          if (!alreadySaved) {
            locObjArry = twcPco.getNodeValue('user', type) || [];
            if (type === "savedLocations") {
              locObjArry.push(loc);
            } else {
              twcPco.getNodeValue('user', type).unshift(loc);
            }
            var truncatedLocations = locObjArry.slice(0, Math.min(locObjArry.length, 10));

            /***
             * Persist change in localStorage
             */
            twcPco.setNodeValue("user", type, truncatedLocations);
          }
        }
      }

      function removeLocation(location, type) {
        /***
         * Type can be:
         * 'savedLocations'
         * 'recentSearchLocations'
         */
        if (location) {
          var currentLocations = twcPco.getNodeValue('user', type);

          location = location.attrs ? location.attrs : location;
          location = location.data ? location.data : location;

          for (var i = currentLocations.length - 1; i >= 0; i--) {
            if (currentLocations[i].locId === location.locId) {
              currentLocations.splice(i, 1);
              break;
            }
          }

          /***
           * Persist change in localStorage
           */
          twcPco.setNodeValue('user', type, currentLocations);
        }
      }


      /**********************************************
       *
       * Private Functions:
       * Models
       */

      /***
       * createModel
       * @param locModel
       * @returns {XwebModelClass}
       */
      function createModel(locModel) {
        if (locModel.getCity &&
          locModel.getStateCode &&
          locModel.getCountry &&
          locModel.getCountryCode &&
          locModel.getLocType) {

          return new XwebModelClass({
            'id': locModel.getId() || '',
            'name': locModel.getCity() + ', ' + locModel.getStateCode() + ', ' + locModel.getCountry(),
            'key': locModel.getFullLocId(),
            'lat': locModel.getLatitude(),
            'long': locModel.getLongitude(),
            'locId': locModel.getLocId(),
            'locType': locModel.getLocType(),
            'cntryCd': locModel.getCountryCode(),
            '_country': locModel.getCountry(),
            'stCd': locModel.getStateCode(),
            'stNm': locModel.getState() || '',
            'cityNm': locModel.getCity() || '',
            'bigCity': locModel.getBigCity && locModel.getBigCity() || false,
            'nickname': locModel.getNickname && locModel.getNickname() || '',
            'tag': locModel.getTag && locModel.getTag() || '',
            'address': locModel.getAddress && locModel.getAddress() || '',
            'position': locModel.getPosition(),
            'recentSearch': true
          }, 'XwebWebLocModelClass');
        } else {
          return null;
        }
      }

      /***
       * createWxdLocModel
       * @param loc
       * @returns {WxdLocModelClass}
       */
      function createWxdLocModel(loc) {
        return new WxdLocModelClass({
          'id': loc.getId() || '',
          'cntryCd': loc.getCountryCode(),
          'lat': loc.getLatitude ? loc.getLatitude() : '',
          'long': loc.getLongitude ? loc.getLongitude() : '',
          'locId': loc.getLocId(),
          'locType': loc.getLocType(),
          'cityNm': twcUtil.capitalize(loc.getCity(), true, true),
          'bigCity': loc.isBigCity(),
          'stCd': loc.getStateCode(),
          'stNm': loc.getState(),
          'prsntNm': loc.getFormattedName(),
          '_country': loc.getCountryName(),
          'nickname': loc.getNickname() || '',
          'zipCd': loc.getZipCode() || '',
          'position': loc.getPosition()
          //'recentSearch':  type === 'recentSearch'
        }, 'WxdLocModelClass');
      }

      //TODO: This doesn't appear to be used. Is it okay to remove? Why was it here?
      /*function setSettings(settings, module_id) {
       _settings = settings;
       _moduleId = module_id;
       }*/

    }
  ]);
;
angular.module('gm_locations').factory('gmLocationsCookies', ['twcPco',
  function () {
    'use strict';

    return {
      removeSession: function(){
        var cookieConfig = { path:'/', domain:'.weather.com' };
        jQuery.removeCookie('userSession', cookieConfig);
        jQuery.removeCookie('uplogin', cookieConfig);
        jQuery.removeCookie('dsx', cookieConfig);
      }
    };
  }
]);
;
/**
 * This service provides a generic way to create Locations
 */
/*jshint -W065 */


angular.module('gm_locations').factory('gmLocationsModals', ['$rootScope', '$modal', 'customEvent',
  function ($rootScope, $modal, customEvent) {
    'use strict';

    var _rootScope = $rootScope.$new();

    var self = this;

    self.rootScope = _rootScope;

    self.profile = {
      /*promptForLogin: function (scope) {
       this.open(scope);
       return customEvent.getEvent('ups-post-message');
       },*/
      showMessage_MustLoginToSave: function (scope) {
        scope.message = 'You must log in to save locations.';
        self.error.open(scope);
      },
      open: function () {
        window.scrollTo(0,0);
        return customEvent.getEvent('GML_COMMAND_PROFILE_MODAL_OPEN').notify();
      }
    };

    self.migration = {
      open: function ($scope, locationsMigrated, locationsRejected, savedLocations) {
        $modal.open({
          templateUrl: '/sites/all/modules/glomo/shared/gm_locations/components/migration-modal/migration-modal.html',
          controller: 'gmLocationsMigrationModalInstanceCtrl',
          windowClass: 'gm-locations-modal pref-intro-dialog',
          backdrop: true,
          scope: $scope,
          resolve: {
            rejectedCollection: function () {
              return locationsRejected ? locationsRejected : '';
            },
            totalSavedLocations: function () {
              return savedLocations ? savedLocations.length : 0;
            }
          }
        });
      }
    };

    self.error = {
      open: function ($scope) {
        if(!$scope.title) {
          $scope.title = 'Oops!';
        }
        $modal.open({
          templateUrl: '/sites/all/modules/glomo/shared/gm_locations/components/error-modal/error-modal.html',
          controller: 'gmLocationsErrorModalInstanceCtrl',
          windowClass: 'gm-locations-modal',
          size: 'sm',
          scope: $scope
        });
      }
    };

    self.confirmDelete = {
      open: function ($scope, size) {
        return $modal.open({
          templateUrl: '/sites/all/modules/glomo/shared/gm_locations/components/confirm-delete-modal/confirm-delete-modal.html',
          controller: 'gmLocationsConfirmModalInstanceCtrl',
          windowClass: 'gm-locations-modal',
          size: size || 'sm',
          scope: $scope
        });
      }
    };

    return self;


  }]);
;
/**
 * This service provides a generic way to create Locations
 */
/*jshint -W065 */


angular.module('gm_locations').factory('gmLocationsMigration', ['$q', 'gmLocationsDatasource', 'gmLocationsSavedLocations', 'gmLocationsTemporaryLocations', 'gmLocationsModals', 'customEvent', 'pcoUser',
  function ($q, gmLocationsDatasource, gmLocationsSavedLocations, gmLocationsTemporaryLocations, gmLocationsModals, customEvent, pcoUser) {
    'use strict';


    /****************************************
     *
     * Public Interface
     */

    return {
      syncEventHandler: syncEventHandler
    };


    /****************************************
     *
     * Private Functions
     */

    function syncEventHandler(scope) {
      customEvent.getEvent('profileIsMerged').progress(function (payload) {
        var locationsSaved = payload.locs2Write2Dsx.locations;
        var locationsRejected = payload.locsMoved2RecentSearch;
        var locationsMigrated = payload.locsAddedToProfile;
        var locationsUpdated = getLocationsUpdated(locationsSaved, locationsMigrated);

        if (locationsMigrated && locationsMigrated.length > 0) {
          saveMergedLocations(scope, locationsUpdated, locationsMigrated, locationsRejected, locationsSaved, payload);
        } else {
          saveLocationSortOrder(scope, locationsUpdated, locationsMigrated, locationsRejected, locationsSaved, payload);
        }
      });
    }

    /***
     * saveMergedLocations
     * Attempt to save new locations,
     * and update sort order on existing
     */
    function saveMergedLocations(scope, locationsUpdated, locationsMigrated, locationsRejected, locationsSaved, payload) {
      var p1 = gmLocationsDatasource.updateMany(locationsUpdated);
      var p2 = gmLocationsDatasource.saveMany(locationsMigrated);
      $q.all(p1, p2).then(function () {

        /*** Update the view model */
        gmLocationsSavedLocations.reload();
        gmLocationsTemporaryLocations.reload();

        /*** Success message */
        gmLocationsModals.migration.open(scope, locationsMigrated, locationsRejected, locationsSaved);

      }, function () {

        /*** Failed message and rollback PCO */
        scope.message = 'There was an while error saving your locations. We will roll back the changes.';
        gmLocationsModals.error.open(scope);
        pcoUser.restoreProfileLocations();

      });
    }

    /***
     * saveLocationSortOrder
     * No new locations, but sorting has been added to existing.
     */
    function saveLocationSortOrder(scope, locationsUpdated, locationsMigrated, locationsRejected, locationsSaved, payload) {

      /*** Update the view model */
      gmLocationsSavedLocations.reload();
      gmLocationsTemporaryLocations.reload();

      /***
       * Save the updated sort order on existing.
       * This is because we didn't previously have a sort order.
       */
      gmLocationsDatasource.updateMany(locationsUpdated).then(function () {
        gmLocationsModals.migration.open(scope, locationsMigrated, locationsRejected, locationsSaved);
      });
    }

    function getLocationsUpdated(locationsSaved, locationsMigrated) {
      var locationsUpdated = [];
      var locationsMigratedIds = [];

      angular.forEach(locationsMigrated, function (location) {
        locationsMigratedIds.push(location.id);
      });

      angular.forEach(locationsSaved, function (location) {
        if (locationsMigratedIds.indexOf(location.id) === -1) {
          locationsUpdated.push(location);
        }
      });

      return locationsUpdated;
    }

  }]);
;
/**
 * Created by robert.blaske on 2/15/16.
 */

angular.module('gm_locations').service('gmLocationsLocationsBase', ['gmLocationsModals', 'customEvent',
  function (gmLocationsModals, customEvent) {
    'use strict';

    /***
     * createService()
     * The reason for this factory method is that this service needs
     * a locationsProvider in its construction.
     */
    this.createService = function (locationsProvider) {
      var _lastRemovedIndex;
      var _lastRemovedLocation;
      var _subscribers = [];
      var _locations;


      /**************************************
       *
       * Public Interface
       */

      return {
        notifyListChanged: notifyListChanged,
        removeLocation: removeLocation,
        rollbackRemovedLocation: rollbackRemovedLocation,
        addLocation: addLocation,
        rollbackAddLocation: rollbackAddLocation,
        updateLocationFailed: updateLocationFailed,
        reload: reload,
        subscribeProfileLocationsLoaded: subscribeProfileLocationsLoaded,
        publicInterface: {
          get list() {
            if (!_locations) {
              _locations = locationsProvider.getAll();
            }
            return _locations;
          },
          reload: reload,
          subscribeListChanged: subscribeListChanged,
          get hasLocations() {
            if (_locations && _locations.length) {
              return _locations.length > 0;
            }
            return false;
          },
          save: null, // Override
          remove: null, // Override
          update: null, // Override
          updateMany: null // Override
        }
      };


      /**************************************
       *
       * Inheritable Events
       *
       * This pub/sub model is provided to notify clients
       * that do not bind directly to the "list"
       * property but want to know when the list
       * has changed. This is a lighter weight way of
       * watching for changes than using Angular watchers.
       */

      function subscribeListChanged(subscribedMethod) {
        _subscribers.push(subscribedMethod);
      }

      function notifyListChanged() {
        angular.forEach(_subscribers, function (subscribedMethod) {
          subscribedMethod();
        });
      }


      /**************************************
       *
       * Event Handlers
       */

      function subscribeProfileLocationsLoaded() {
        customEvent.getEvent('profileLocationsLoaded').progress(function (event) {
          reload();
        });
      }


      /**************************************
       *
       * Inheritable Methods
       */

      function reload() {
        _locations = locationsProvider.getAll();
        notifyListChanged();
      }

      function removeLocation(wxdLocModel_Loc) {
        for (var i = 0; i < _locations.length; i++) {
          if (_locations[i].data.locId === wxdLocModel_Loc.data.locId) {
            _lastRemovedLocation = _locations[i];
            _lastRemovedIndex = i;
            _locations.splice(i, 1);
            break;
          }
        }
      }

      function rollbackRemovedLocation() {
        _locations.splice(_lastRemovedIndex, 0, _lastRemovedLocation);
      }

      function addLocation(xwebWebLocModel_Loc) {
        _locations.push(xwebWebLocModel_Loc);
      }

      function rollbackAddLocation() {
        _locations.pop();
      }

      function updateLocationFailed() {
        gmLocationsModals.rootScope.message = 'There was an error updating the location. Please try again later.';
        gmLocationsModals.error.open(gmLocationsModals.rootScope);
      }

    };
  }
]);
;
/**
 * Created by robert.blaske on 2/15/16.
 */

angular.module('gm_locations').factory('gmLocationsRecentLocations', ['gmLocationsLocationsBase', 'gmLocationsSavedLocations', 'gmLocationsPco', 'gmLocationsModals', 'gmLocationsMetrics', 'customEvent',
  function (gmLocationsLocationsBase, gmLocationsSavedLocations, gmLocationsPco, gmLocationsModals, gmLocationsMetrics, customEvent) {
    'use strict';

    var base = gmLocationsLocationsBase.createService(gmLocationsPco.recentLocations);
    angular.extend(this, base);
    var self = this;

    self.subscribeProfileLocationsLoaded();

    /********************************************
     *
     * Public Interface
     */

    return angular.extend(self.publicInterface, {
      remove: remove
    });

    /********************************************
     *
     * Private Functions
     */

    function remove(xwebWebLocModel_Loc) {
      gmLocationsMetrics.customEventNotify('delete-recently-searched', gmLocationsModals.rootScope);
      if (xwebWebLocModel_Loc && xwebWebLocModel_Loc.data && xwebWebLocModel_Loc.data.recentSearch === true) {

        var wxdLocModel_Loc = gmLocationsPco.createWxdLocModel(xwebWebLocModel_Loc);
        gmLocationsPco.recentLocations.remove(wxdLocModel_Loc);

        /*** Update UI */
        self.removeLocation(wxdLocModel_Loc);
        self.notifyListChanged();
      }
    }


  }
]);
;
/**
 * Created by robert.blaske on 2/15/16
 */

angular.module('gm_locations').factory('gmLocationsSavedLocations', ['$q', 'gmLocationsLocationsBase', 'gmLocationsPco', 'gmLocationsDatasource', 'gmLocationsModals', 'gmLocationsMetrics',
  function ($q, gmLocationsLocationsBase, gmLocationsPco, gmLocationsDatasource, gmLocationsModals, gmLocationsMetrics) {
    'use strict';

    var base = gmLocationsLocationsBase.createService(gmLocationsPco.savedLocations);
    angular.extend(this, base);
    var self = this;

    //var _savedLocations;
    //var _lastRemovedLocation;
    //var _lastRemovedIndex;
    var _maxLimit = 10;

    self.subscribeProfileLocationsLoaded();


    /**************************************
     *
     * Public Interface
     */

    return angular.extend(self.publicInterface, {
      save: save,
      saveWithVerify: saveWithVerify,
      remove: remove,
      removeWithConfirm: removeWithConfirm,
      update: update,
      updateMany: updateMany,
      maxLimit: _maxLimit,
      maxLimitReached: maxLimitReached
    });


    /**************************************
     *
     * Event Handlers
     */


    /**************************************
     *
     * Private Functions
     * Publicly exposed
     */

    function saveWithVerify(xwebWebLocModel_Loc, callback) {
      if (maxLimitReached()) {
        gmLocationsModals.rootScope.title = 'Maximum Allowable Is ' + _maxLimit;
        gmLocationsModals.rootScope.message = 'You have exceeded the maximum allowable saved locations, You may delete older saved locations before adding new ones.';
        gmLocationsModals.error.open(gmLocationsModals.rootScope);
      }
      else {
        if (hasSavedLocation(xwebWebLocModel_Loc)) {
          var displayName = getDisplayName(xwebWebLocModel_Loc);
          gmLocationsModals.rootScope.message = '<strong>' + displayName + '</strong> has already been saved.';
          gmLocationsModals.error.open(gmLocationsModals.rootScope);
        } else {
          save(xwebWebLocModel_Loc).finally(callback);
        }
      }
    }

    function save(xwebWebLocModel_Loc) {
      var wxdLocModel_Loc = gmLocationsPco.createWxdLocModel(xwebWebLocModel_Loc);

      /***
       * Update the UI
       */
      self.addLocation(xwebWebLocModel_Loc);
      self.notifyListChanged();

      /***
       * Update datasources
       */
      return gmLocationsDatasource.save(xwebWebLocModel_Loc).then(function () {
        gmLocationsPco.savedLocations.add(wxdLocModel_Loc);
      }).catch(function () {
        self.rollbackAddLocation();
        self.notifyListChanged();
        gmLocationsModals.rootScope.message = 'There was an error saving the location. Please try again later.';
        gmLocationsModals.error.open(gmLocationsModals.rootScope);
      });
    }

    function removeWithConfirm(xwebWebLocModel_Loc) {
      /***
       * Check if there are alerts
       */
      gmLocationsDatasource.getLocationEndpointsAlerts(xwebWebLocModel_Loc).then(function (endpointsAlerts) {
        /***
         * Confirm before delete
         */
        gmLocationsModals.rootScope.confirmDelete = {};
        gmLocationsModals.rootScope.confirmDelete.displayName = xwebWebLocModel_Loc ? xwebWebLocModel_Loc.getFormattedName(false) : '';
        gmLocationsModals.rootScope.confirmDelete.endpointsAlerts = endpointsAlerts;
        gmLocationsModals.rootScope.confirmDelete.hasAlerts = (endpointsAlerts.length > 0);
        var modalSize = 'm';
        var modalInstance = gmLocationsModals.confirmDelete.open(gmLocationsModals.rootScope, modalSize);
        modalInstance.result.then(function () {
          remove(xwebWebLocModel_Loc);
        });
      }).catch(function (error) {
        gmLocationsModals.rootScope.message = 'There was an error deleting the location. Please try again later.';
        gmLocationsModals.error.open(gmLocationsModals.rootScope);
      });
    }

    function remove(xwebWebLocModel_Loc) {
      /***
       * Location is okay to delete
       */
      var wxdLocModel_Loc = gmLocationsPco.createWxdLocModel(xwebWebLocModel_Loc);

      /*** Update the UI */
      self.removeLocation(wxdLocModel_Loc);
      self.notifyListChanged();

      /***
       * Update datasources
       */
      gmLocationsDatasource.remove(xwebWebLocModel_Loc).then(function () {
        gmLocationsMetrics.customEventNotify('delete-saved', gmLocationsModals.rootScope);
        gmLocationsPco.savedLocations.remove(wxdLocModel_Loc);
      }).catch(function (error) {
        gmLocationsModals.rootScope.message = 'There was an error deleting the location. Please try again later.';
        gmLocationsModals.error.open(gmLocationsModals.rootScope);
        self.rollbackRemovedLocation();
        self.notifyListChanged();
      });
    }

    function update(xwebWebLocModel_Loc) {

      /*** Update the UI */
      self.notifyListChanged();

      return gmLocationsDatasource.update(xwebWebLocModel_Loc).then(function () {
        gmLocationsMetrics.customEventNotify('locationedit', gmLocationsModals.rootScope);
        gmLocationsPco.savedLocations.update(xwebWebLocModel_Loc);
      }).catch(function () {
        self.updateLocationFailed();
      });
    }

    function updateMany(locs) {
      var updateProfilePromises = [];

      /*** Update the UI */
      self.notifyListChanged();

      /***
       /* Create a que of DSX location updates
       */
      angular.forEach(locs, function (loc) {
        updateProfilePromises.push(gmLocationsDatasource.update(loc));
      });

      /***
       * When all DSX locations are saved, update PCO
       */
      return $q.all(updateProfilePromises).then(function () {
        angular.forEach(locs, function (loc) {
          gmLocationsPco.savedLocations.update(loc);
        });
      }).catch(function () {
        self.updateLocationFailed();
      });
    }

    function maxLimitReached() {
      var currentLocationsCount = 0;
      if (self.publicInterface.list && self.publicInterface.list.length) {
        currentLocationsCount = self.publicInterface.list.length;
      }
      return currentLocationsCount >= _maxLimit;
    }

    /*function hasLocations() {
     return self.locations.length > 0;
     }*/


    /**************************************
     *
     * Private Functions
     */

    /*function addLocation(wxdLocModel_Loc) {
     self.locations.push(wxdLocModel_Loc);
     }

     function rollbackAddLocation() {
     self.locations.pop();
     }

     function updateSavedLocationFailed() {
     gmLocationsModals.rootScope.message = 'There was an error updating the location. Please try again later.';
     gmLocationsModals.error.open(gmLocationsModals.rootScope);
     }*/

    /*function removeLocation(wxdLocModel_Loc) {
     for (var i = 0; i < self.locations.length; i++) {
     if (self.locations[i].data.locId === wxdLocModel_Loc.data.locId) {
     _lastRemovedLocation = self.locations[i];
     _lastRemovedIndex = i;
     self.locations.splice(i, 1);
     break;
     }
     }
     }*/

    /*function rollbackRemovedLocation() {
     self.locations.splice(_lastRemovedIndex, 0, _lastRemovedLocation);
     }*/

    function hasSavedLocation(xwebWebLocModel_Loc) {
      //TODO: Compare locId AND address. If one has an address and the other does not, they are not equal
      var key = xwebWebLocModel_Loc.getKey();
      var foundMatch = false;
      angular.forEach(self.publicInterface.list, function(loc) {
        if(key === loc.getKey()) {
          foundMatch = true;
          return;
        }
      });
      return foundMatch;
    }

    function getDisplayName (xwebWebLocModel_Loc) {
      var isMobile = gmLocationsModals.rootScope.isMobile || false;
      return xwebWebLocModel_Loc ? xwebWebLocModel_Loc.getFormattedName(isMobile) : '';
    }

  }
]);
;
/**
 * Created by robert.blaske on 2/15/16.
 */

angular.module('gm_locations').factory('gmLocationsTemporaryLocations', ['gmLocationsLocationsBase', 'gmLocationsPco', 'gmLocationsModals',
  function (gmLocationsLocationsBase, gmLocationsPco, gmLocationsModals) {
    'use strict';

    var base = gmLocationsLocationsBase.createService(gmLocationsPco.temporaryLocations);
    angular.extend(this, base);
    var self = this;

    /********************************************
     *
     * Public Interface
     */

    return angular.extend(self.publicInterface, {
      remove: remove,
      removeWithConfirm: removeWithConfirm
    });

    /********************************************
     *
     * Private Functions
     */

    function remove(xwebWebLocModel_Loc) {
      /*** Update PCO */
      var wxdLocModel_Loc = gmLocationsPco.createWxdLocModel(xwebWebLocModel_Loc);
      gmLocationsPco.temporaryLocations.remove(wxdLocModel_Loc);

      /*** Update UI */
      self.removeLocation(wxdLocModel_Loc);
      self.notifyListChanged();
    }

    function removeWithConfirm(xwebWebLocModel_Loc) {
      /***
       * Confirm before deleting location
       */
      gmLocationsModals.rootScope.confirmDelete = {};
      gmLocationsModals.rootScope.confirmDelete.displayName = xwebWebLocModel_Loc ? xwebWebLocModel_Loc.getFormattedName(false) : '';
      var modalSize = 'm';
      var modalInstance = gmLocationsModals.confirmDelete.open(gmLocationsModals.rootScope, modalSize);
      modalInstance.result.then(function () {
        remove(xwebWebLocModel_Loc);
      });
      return modalInstance.result;
    }

  }
]);
;
(function (root, factory) {
  root.PollenObsTurboModel = factory(root.TwcDalBaseModel);
}(window.TWC, function (TwcDalBaseModel) {

  function pollenObsTurboModel(TwcDalBaseModel) {
    return TwcDalBaseModel.extend({
      transform: function () {

      },
      construct: function (geocode) {
        this.urlConfig = {
          baseUrl: TWC.Configs.sunTurbo.baseUrl || 'https://qaapi.weather.com',
          apiKey: TWC.Configs.sunTurbo.apiKey || '',
          resource: '/v2/turbo/vt1pollenobs',
          language: TWC.Configs.sunTurbo.locale || 'en',
          format: 'json'
        };

        if (geocode) {
          this.urlConfig['geocode'] = geocode;
        }
      }
    });
  }
  return pollenObsTurboModel(TwcDalBaseModel);
}));
;
/**
 * Author: kyoung
 * Date: 4/22/2015
 * Time: 10:55 PM
 * Comments:
 *
 * Directive that can be used to execute a scoped function when the target element is resized.
 * Directive may also be 'required' by other directives
 */

twc.shared.apps.directive('throttledEventsOnResize', [
  '$parse',
  'throttler',
  function ($parse, throttler) {
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        if (attrs.throttledEventsOnResize) {
          var ngExpr = $parse(attrs.throttledEventsOnResize);
          if (ngExpr) {
            throttler.onResize(function () {
              ngExpr(scope, {width: element.width(), height: element.height()});
            });
          }
        }
      }
    };
  }]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 2/7/14
 * Time: 10:55 PM
 * Comments:
 */

twc.shared.apps.factory('throttler',['$q', '$window', 'twcUtil',function ($q, $window, twcUtil) {

  var resizeEvent = $q.defer(), scrollEvent = $q.defer(), scrollEventThrottle = $q.defer();

  angular.element($window).bind('resize', twcUtil.throttle(function () {
    resizeEvent.notify();
  }, 125));

  angular.element($window).bind('orientationchange', twcUtil.throttle(function () {
    resizeEvent.notify();
  }, 125));

  angular.element($window).bind('scroll', twcUtil.debounce(function () {
    scrollEvent.notify();
  }, 250));

  angular.element($window).bind('scroll', twcUtil.throttle(function () {
    scrollEventThrottle.notify();
  }, 50));

  return {
    onResize: function (callback, context) {
      resizeEvent.promise.then(null, null,  callback);
    },

    onScroll: function (callback, context) {
      scrollEvent.promise.then(null, null,  callback);
    },
    onScrollThrottle: function (callback) {
      scrollEventThrottle.promise.then(null, null, callback);
    }
  };
}]);
;
/**
 * This service provides a generic way to return a specific module settings/info by instance
 * @author jefflu
 * @date Aug 30, 2013
 */
/* global twc */
/* global Drupal */
/*jshint -W065 */

twc.shared.apps.factory('DrupalSettings', ['PcoPage', function (PcoPage) {
  'use strict';
  var settings;
  return {
    getArticleUUID: function () {
      return (window.Drupal && window.Drupal.settings && window.Drupal.settings.ct_article && window.Drupal.settings.ct_article && window.Drupal.settings.ct_article.article_uuid);
    },
    getSettings: function (instanceId) {
      // If context exists we use contexts.
      return Drupal.settings.twc.instance[instanceId];
    },
    getContexts: function () {
      return Drupal.settings.twc.contexts;
    },
    getContextArg: function (contextArg) {
      var contexts = this.getContexts();
      return contexts.hasOwnProperty(contextArg) ? contexts[contextArg].id : false;
    },
    getLocation: function (settingsObj, contextName) {
      var contexts  = Drupal.settings.twc.contexts,
          attrName  = contextName || 'twclocation',
          keyName   = settingsObj[attrName],
          pageLocId = PcoPage.getCurrentLocId();
      // If contexts exist, then twclocation is a reference
      // to the correct instance.
      if (contexts) {
        return (contexts[keyName] && contexts[keyName].is_page_loc && pageLocId) ? {id: pageLocId} : contexts[keyName];
      } else { // No context then the location id is passed directly.
        settingsObj.id = keyName;
        return settingsObj;
      }
    },
    getLocId: function (settingsObj, contextName) {
      return this.getLocation(settingsObj, contextName).id;
    },
    // This method deprecated
    //    getLocObj: function(settingsObj) {
    //      return this.getLocation(settingsObj).object;
    //    },
    getAsset: function (settingsObj) {
      var contexts = Drupal.settings.twc.contexts;
      // If contexts exist, then asset is a reference
      // to the correct instance.
      if (contexts) {
        return contexts[settingsObj.twcasset];
      } else { // No context then the location id is passed directly.
        settingsObj.id = settingsObj.twcasset;
        return settingsObj;
      }
    },
    isArticle: function () {
      return !!Drupal.settings['ct_article'];
    },
    getModuleByName: function (name) {
      return Drupal.settings.twc.modules && Drupal.settings.twc.modules[name];
    },
    getAssetId: function (settingsObj) {
      return this.getAsset(settingsObj).id;
    },
    getInstanceIdBySettings: function (settings) {
      return Object.getKey(Drupal.settings.twc.instance, settings);
    },
    // This is used only for testing
    getInstanceId: function (index) {
      return Object.keys(Drupal.settings.twc.instance)[index];
    },
    getPathInfo: function () {
      var pathItems = window.location.pathname.split('/');
      return pathItems[pathItems.length - 1];
    }
  };
}]);
;
/**
 * This service provides a generic way to create custom event
 * @author jefflu
 * @date Aug 1, 2013
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('customEvent', function () {
  'use strict';
  return TWC.Events;
});
;
/**
 * Author: ksankaran (Velu)
 * Date: 5/27/14
 * Time: 8:03 PM
 * Comments: Cache response from dsx in local storage. As of now, we are caching all
 * records to one minute. Work is in progress with DSX to send us the actual expiration time.
 */

twc.shared.apps.factory('dsxLocalCache',['$window', 'twcUtil', '$log', '$timeout', 'twcConfig', 'RecordUtil', function ($window, twcUtil, $log, $timeout, twcConfig, RecordUtil) {

  /**
   * Why do we have to do this?
   * In latest browsers, when privacy settings is turned on to block any data being stored
   * then, they throw crazy exception to prevent accessing (duh!!).
   */

  var isLocalStorage = false;
  try {
    isLocalStorage = !!(('localStorage' in $window) && $window.localStorage);
  }
  catch (err) {
    $log.debug('Unable to access local storage. Going to make calls every time.');
  }

  var vars = {
    hasWebStorage: isLocalStorage,
    webStorage: isLocalStorage ? $window['localStorage'] : {},
    webStorageMax: twcConfig.dsxclient.cache_size, // In no of items
    itemQueue: [],
    itemMap: {},
    expirationTime: twcConfig.dsxclient.cache_expiry, // In seconds
    timeoutPromise: null,
    locale: twcConfig.dsxclient.locale,
    version: 5 // to flush out old storage items in case of upgrades.
  };

  var fns = {
    getStorageKey: function () {
      return 'dsxcache';
    },

    deleteItem: function (key) {
      if (key in vars.itemMap) {
        var item        = vars.itemMap[key];
        // delete item from queue.
        vars.itemQueue  = twcUtil.without(vars.itemQueue, item);
        // delete item from util map.
        delete vars.itemMap[key];
      }
    },

    getUnExpiredRecords: function (items) {
      return twcUtil.filter(items, function (item) {
        return !(fns.isExpired(item));
      });
    },

    storeInMemory: function (key, valueObj) {
      // set cacheKey
      valueObj.cacheKey = key;
      // if the key is in map already, delete it.
      if (key in vars.itemMap) {
        fns.deleteItem(key);
      }

      vars.itemMap[key] = valueObj;
      vars.itemQueue.push(valueObj);
    },

    writeToStorage: function () {
      // Writing to local storage is costly. So, try and keep the number of writes to a minimum
      if (vars.timeoutPromise) {
        vars.timeoutPromise = $timeout.cancel(vars.timeoutPromise) && false;
      }

      // Schedule the write to two seconds later than now. If any other process tries to write
      // meanwhile, it will cancel the existing timer and scheduler later from that moment on.
      // So, the plan is to execute only once after a string of operations.
      vars.timeoutPromise = $timeout(function () {
        // filter for expiry again coz few objects may not be worth to cache.
        var records = fns.getUnExpiredRecords(vars.itemQueue);
        if (records.length > vars.webStorageMax) {
          var addlItemsLen = (records.length - vars.webStorageMax);
          records = records.slice(addlItemsLen);
        }
        vars.webStorage.setItem(fns.getStorageKey(), angular.toJson({version: vars.version, locale: vars.locale, records: records}));
      }, 2000);
    },

    init: function () {
      if (vars.hasWebStorage) {
        try {
          var items = vars.webStorage.getItem(fns.getStorageKey()), currentTime = (new Date()).getTime(),
              itemsObj = items ? angular.fromJson(items) : {};

          // Remove this after cache issues resolved
          // If version 3 or 4 dsxcache, flush dsxcache
          if (itemsObj && itemsObj.version < 5) {
            window.localStorage.removeItem(fns.getStorageKey());
            // Resetting users to 'F' as default if its not already set to F
            if (window.TWC && TWC.pco && TWC.pco.get && TWC.pco.getNodeValue('user', 'unit') !== 'e') {
              TWC.pco.getNodeValue('page','lang') === 'en' && TWC.pco.setNodeValue && TWC.pco.setNodeValue('user','unit','e');
            }

          }

          if (itemsObj.version && itemsObj.version === vars.version && itemsObj.locale && itemsObj.locale === vars.locale) {
            var records = fns.getUnExpiredRecords(itemsObj.records);
            vars.itemQueue = records;
            angular.forEach(records, function (item) {
              vars.itemMap[item.cacheKey] = item;
            });
          }
          // dsx warmup for page location object from explicit_location
          var pageLocId = window.explicit_location, pageLocObj = window.explicit_location_obj,
            cacheId = RecordUtil.getRecordID({recordType: 'wxd', recordName: 'loc', fullLocId: pageLocId});
          if (pageLocId && pageLocObj && !(cacheId in vars.itemMap)) {
            var objToPersist = {
              cacheKey: cacheId,
              timestamp: (((new Date()).getTime()) + 10000),
              doc: pageLocObj,
              id: cacheId,
              status: 200
            };
            vars.itemMap[cacheId] = objToPersist;
            vars.itemQueue.push(objToPersist);
          }
          // Sync to local storage on up.
          fns.writeToStorage();
        }
        catch (err) {
          $log.debug('Exception while trying to initialize webstorage cache. Resetting it.');
          vars.webStorage.removeItem(fns.getStorageKey());
        }
      }
    },

    isExpired: function (item) {
      var currentTime = (new Date()).getTime();
      return (!('timestamp' in item) || item.timestamp < currentTime);
    },

    getExpirationTime: function (recordResponse) {
      var currentTime = (new Date()).getTime(), expirationTime = vars.expirationTime;
      if (recordResponse && recordResponse.generatedTime && recordResponse.cacheMaxSeconds && recordResponse.currentTime) {
        var recordExpiration = recordResponse.cacheMaxSeconds - (recordResponse.currentTime - recordResponse.generatedTime);
        if (recordExpiration > 0 &&
          (recordExpiration < 600 ||
            (recordResponse.id && (recordResponse.id.match(/\/loc\//) || recordResponse.id.match(/\/Astro\//))))) {
          expirationTime = recordExpiration;
        }
      }
      return currentTime + (expirationTime * 1000);
    }
  };

  // Initialize the object
  fns.init();

  return {
    /**
     * Is local storage enabled for the browser?
     *
     * @returns {*}
     */
    isEnabled: function () {
      return vars.hasWebStorage;
    },

    /**
     * Add a record response to local storage - the key being the record id (Eg: /wxd/loc/30339:4:US) and
     * value being the response from DSX itself.
     * @param key
     * @param value
     */
    add: function (key, value) {
      // Write only if it has local storage.
      if (value && vars.hasWebStorage) {
        // store in objects layer first
        fns.storeInMemory(key, angular.extend(value, {timestamp: fns.getExpirationTime(value), lscache: true}));
        // Persist the entire queue to keep this object sane.
        fns.writeToStorage();
      }
    },

    /**
     * Get a record from local storage. If expired, the record is deleted.
     * @param key
     * @returns {*}
     */
    get: function (key) {
      var currentTime = (new Date()).getTime();
      if ((key in vars.itemMap) && fns.isExpired(vars.itemMap[key])) {
        return null;
      }
      return vars.itemMap[key];
    }
  };
}]);
;
/**
 * User: thomas.vo
 * Date: 2/25/14
 * Time: 5:36 AM
 *
 */
twc.shared.apps.factory('TwcDomEventOriginVerifier', ['twcUtil', 'TwcClass', 'pcoUser', function (twcUtil, TwcClass, pcoUser) {

  var incrementId = 0;
  var namespace = 'twcDomEventOriginVerifier';
  return TwcClass.extend({
    construct: function (originator, events) {
      this.id = incrementId++;
      if (originator) {
        this.setOriginator(originator);
        if (events) {
          this.bindEvents(events);
        }
      }
    },

    /**
     *
     * @param originator DOM element
     */
    setOriginator: function (originator) {
      this.originator = angular.element(originator);
    },

    /**
     *
     * @param events ['event1','event2',...] or 'event1 event2 ....'
     */
    bindEvents: function (events) {
      events = twcUtil.isArray(events) ? events : events.split(/\s+/);

      var eventStr = twcUtil.reduce(events, function (str, event) {
        return str + (event ? event + '.' + namespace + ' ' : '');
      },'');

      var self = this;
      if (pcoUser.getBrowser().ltIE9) {
        this.originator.on(eventStr, function (e) {
          if (e.originalEvent) {
            e.originalEvent.data = namespace + ':' + self.id;
          }
        });
      } else {
        this.originator.on(eventStr, function (e) {
          if (e.originalEvent) {
            e.originalEvent[namespace] = self.id;
          }
        });
      }
    },

    cleanUp: function () {
      if (this.originator) {
        this.originator.off('.' + namespace);
      }
    },

    /**
     * Check if event comes from the *originator*
     * @param event
     * @returns {boolean}
     */
    verifyOrigin: function (event) {
      event = event.originalEvent || event;
      if (pcoUser.getBrowser().ltIE9) {
        return event.data === namespace + ':' + this.id;
      } else {
        return event[namespace] === this.id;
      }
    },

    /**
     * alias of verifyOrigin
     * @param event
     * @returns {boolean}
     */
    test: function (event) {
      return this.verifyOrigin(event);
    }
  });
}])
  .factory('eventOrigin', ['TwcDomEventOriginVerifier', function (TwcDomEventOriginVerifier) {
    return {
      init:function (params) {
        var scope = params.scope;
        var events = params.event || params.events;
        var origin = params.origin;
        var verifier = new TwcDomEventOriginVerifier(origin, events);

        scope.$on('$destroy', function () {
          verifier.cleanUp();
        });

        return verifier;
      }
    };
  }]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 12/12/13
 * Time: 8:25 AM
 * Comments: A utility factory which will contain all location related ops.
 */

twc.shared.apps.factory('locUtil',['twcUtil', function (twcUtil) {
  // Private methods here if needed.
  function convertToLocId(locObj) {
    if (!locObj) {
      return null;
    }

    if (twcUtil.isString(locObj)) {
      if ((('' + locObj).length === 5) && !isNaN(locObj)) {
        return locObj + ':4:US';
      }
      if (locObj.length === 8 && locObj.slice(0,2) === 'US') {
        return locObj + ':1:US';
      }
      if (locObj.split(',').length === 2) {
        return locObj;
      }
      if ((splitLength = locObj.split(':').length) >= 2) {
        return locObj + (splitLength === 2 ? ':US' : '');
      }
      if (locObj.split(':').length === 3) {
        return locObj;
      }
    } else if (twcUtil.isNumber(locObj) && locObj.toString().length === 5) {
      return locObj + ':4:US';
    } else if (twcUtil.isObject(locObj)) {
      if ('lat' in locObj && 'lng' in locObj) {
        return locObj['lat'] + ',' + locObj['lng'];
      }
      if ('locId' in locObj && 'locType' in locObj && 'cntryCd' in locObj) {
        return locObj['locId'] + ':' + locObj['locType'] + ':' + locObj['cntryCd'];
      }
    }

    // We don't know how to handle it. Return null.
    return null;
  }

  // TODO: Add unit test.
  function areLocationsEqual(location1, location2) {
    if (location1 && location2) {
      // return (location1.locId === location2.locId);
      return convertToLocId(location1) === convertToLocId(location2);
    }

    return false;
  }

  return {
    getFullLocId: function (locObj) {
      return convertToLocId(locObj);
    },
    areLocationsEqual: function (location1, location2) {
      return areLocationsEqual(location1, location2);
    }
  };
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 6/4/14
 * Time: 9:37 PM
 * Comments: Util methods related to dsxclient aggregate URL processing, record processing and param processing.
 */

twc.shared.apps.factory('AggregateUtil',['RecordUtil', 'Set', function(RecordUtil, Set) {

  /**
   * Use getRecordURL to figure out the pieces need for each config object. Returns a two dimensional array.
   *
   * @param configs - array of configs to be used to form aggregations.
   * @returns {Array}
   */
  function getURLAggregations( configs ) {
    var urlaggregations = [];
    angular.forEach( configs , function( config ) {
      urlaggregations.push(
        RecordUtil.getRecordURL( config )
      );
    });
    return urlaggregations;
  }

  /**
   * This method is a utility method to reduce aggregated URL length. For example, if you need three records and
   * each of recordType wxd, we don't have to start aggregating wxd in the URL. To be more clear: if you need three
   * records a,b,c for 30339 from wxd, the url will look like
   * http://dsx.weather.com/{wxd/a/30339:4:US;wxd/b/30339:4:US;wxd/c/30339:4:US}. But as we understand, this results
   * in longer URL and we desire a URL like: http://dsx.weather.com/wxd/{a/30339:4:US;b/30339:4:US;c/30339:4:US}
   * In order to tune this, this method will try to figure out all requests with similar prefix.
   *
   * @param urlaggregations - two dimensional array returned from getURLAggregations
   * @returns {*}
   */

  function getCommonPrefix( urlaggregations ) {
    var urlParts = [], commonParts = [], minlength = 99;
    angular.forEach( urlaggregations, function( urlaggregation ) {
      // find minlength
      if(urlaggregation.length < minlength) {
        minlength = urlaggregation.length;
      }
      // insert into set
      angular.forEach(urlaggregation, function( urlpart, idx ) {
        urlParts[idx] = urlParts[idx] || new Set();
        urlParts[idx].add( urlpart );
      });
    });

    // to break in between loops
    for(var idx = 0, max_traversal = minlength - 1; idx < max_traversal; idx++) {
      var hashSet = urlParts[idx], entries = hashSet.getAll();
      if(hashSet.hasKey("cms") && entries.length > 1) {
        throw "cms call cannot be aggregated.";
      }
      if(entries.length !== 1) {
        break;
      }
      commonParts.push( entries[0] );
    }

    return commonParts;
  }

  /**
   * Same as above but try to just abstract the locID out of the aggregation.
   * TODO: Get locale as well.
   * @param urlaggregations
   * @returns {*}
   */
  function getCommonLocID( urlaggregations ) {
    var locIDs = new Set();
    for(var idx = 0, len = urlaggregations.length; idx < len; idx++) {
      var urlaggregation = urlaggregations[idx], agglen = urlaggregation.length, lastParam = urlaggregation[agglen - 1];
      if(lastParam && lastParam.match && lastParam.match(/^([^:]+):([^:]+):([A-Z]{2})$/)) {
        locIDs.add(lastParam);
      }
      else {
        locIDs = false;
        break;
      }
    }
    var locs = locIDs && locIDs.getAll();
    return (locs && locs.length === 1 && urlaggregations.length > 1) ? locs[0] : false;
  }

  /**
   * This method will use the intelligence provided by getCommonRecordType and the data provided by getURLAggregations
   * to output the shortest possible URL. Well, its not exactly shortest but the best a generic code can provide.
   *
   * @param urlaggregations
   * @returns {string}
   */
  function formAggregatedURL( urlaggregations ) {
    var commonItemsInRecords = getCommonPrefix( urlaggregations ), commonLocID = getCommonLocID( urlaggregations ), newAggregations = [];
    for(var idx= 0, length = urlaggregations.length; idx < length; idx++) {
      var cAggregation = urlaggregations[idx];
      if(commonItemsInRecords.length > 0) {
        cAggregation = cAggregation.slice( commonItemsInRecords.length );
      }
      if(commonLocID) {
        cAggregation = cAggregation.slice( 0, cAggregation.length - 1 );
      }
      newAggregations.push( cAggregation.join("/") );
    }

    return (commonItemsInRecords.length > 0 ? (commonItemsInRecords.join("/") + "/") : "") +
          ("(" + newAggregations.join(";") + ")") +
          (commonLocID ? ("/" + commonLocID) : "");
  }

  return {
    /**
     * Get aggregated URL based on configs.
     *
     * @param configs
     * @returns {string}
     */
    getAggregatedURL : function( configs ) {
      return formAggregatedURL( getURLAggregations( configs ) );
    }
  };
}]).factory('ParamUtil',['twcConfig', 'twcUtil', function(twcConfig, twcUtil) {

  var dsxclient_config = twcConfig.dsxclient;

  /**
   * Parse record param based on record config in dsxclient.config.
   *
   * @param paramMap
   * @param config
   * @returns {{}}
   */
  function parseRecordParam( paramMap, config ) {
    var recordConfig = dsxclient_config[config.recordType].recordConfig[config.recordName];
    var returnMap = {};
    if(recordConfig && 'paramFormat' in recordConfig) {
      returnMap = recordConfig.paramFormat( paramMap, twcUtil );
    }
    return returnMap;
  }

  return {
    parseParams : function( configs ) {
      var result = {};
      angular.forEach( configs , function( config ) {
        if(config.custom_params) {
          result = angular.extend(result, parseRecordParam(config.custom_params, config));
        }
      });
      return result;
    }
  };
}]).factory('RecordUtil',['twcConfig', 'twcUtil', function(twcConfig, twcUtil) {

  var dsxclient_config = twcConfig.dsxclient;

  return {
    /**
     * Get record URL for a config object.
     *
     * @param config
     * @returns {*}
     */
    getRecordURL : function( config ) {
      if('url' in config) {
        return config.url.split("/");
      }
      var recordConfig = dsxclient_config[config.recordType].recordConfig[config.recordName];
      var pathFormat = dsxclient_config[config.recordType].defaultPathFormat;
      if(recordConfig && recordConfig.pathFormat) {
        pathFormat = recordConfig.pathFormat;
      }
      return pathFormat( config, dsxclient_config );
    },

    /**
     * Get record ID for the config object. Uses getRecordURL but removes duplicates
     * and adds slash at the beginning.
     *
     * @param config
     * @returns {string}
     */
    getRecordID : function( config ) {
      return ("/" + twcUtil.removeDupChar(this.getRecordURL( config ).join("/"), '/'));
    },

    getUniqueKey : function( config ) {
      return ("/" + twcUtil.removeDupChar(this.getRecordURL( config ).join("/"), '/') + (config.custom_params ? ("-" + JSON.stringify(config.custom_params)) : ""));
    }
  };
}]);;
/**
 * Author: ksankaran (Velu)
 * Date: 11/12/13
 * Time: 11:37 AM
 * Comments: A simple dsxclient that will act as interface to all DSX calls. The interface is robust enough
 * to accept any record and return an consolidated model response. The response will also have raw data to work on.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('timeoutHttpIntercept', function () {
  return {
    'request': function(config) {
      // timeout in 30 seconds. This allows for 3 batches of network calls and a lot of network weirdness. Better to err on the
      // side of slow response over no response.
      config.timeout = 30000;
      return config;
    }
  };
}).config(['$httpProvider',function($httpProvider) {
  // JSONP calls will not timeout on {timeout : value} param in $http. It has to be intercepted.
  // Works only from bleeding edge version.
  $httpProvider.interceptors.push('timeoutHttpIntercept');
}]).factory('AsyncCallCounter', [function() {
  return {
    "increment" : function() {
      // increment async call count
      window.twc.async_calls   = (window.twc.async_calls ? ++window.twc.async_calls : 1);
    },

    "decrement" : function() {
      if(window.twc.async_calls > 0) {
        --window.twc.async_calls;
      }
    }
  };
}]).factory("dsxclient",['httpclient', 'twcConfig', '$injector', 'twcUtil', 'Set', '$log', 'PromisePool', 'PromisePoolStatusCodes', '$q', 'RecordUtil', 'AggregateUtil', 'ParamUtil', 'PcoPerf', 'DsxClientPromise', 'DsxClientResponse', 'dsxLocalCache', 'AsyncCallCounter', function (httpclient, twcConfig, $injector, twcUtil, Set, $log, PromisePool, PromisePoolStatusCodes, $q, RecordUtil, AggregateUtil, ParamUtil, PcoPerf, DsxClientPromise, DsxClientResponse, dsxLocalCache, callCounter) {
  // Private methods here.

  /* Get the config object from twcConfig and set the config var. There are several namespaces in twcConfig
   * and dsxclient is the one for this one.
   */
  var dsxclient_config = twcConfig.dsxclient;

  var dsxPromisePool      = new PromisePool();

  /**
   * Common error message for failed model creations.
   */
  var MODEL_ERROR_RESPONSE = {"error" : "Invalid response body. Cannot create model"};


  /**
   * Make a judgement call on whether you can cache the current set of items.
   *
   * @param configs
   * @returns {boolean}
   */
  function isCacheable( configs ) {
    // TODO:  We are relying to much on configuration and it's going to get out of hands and a maintenance nightmare.  Having a cacheable property is an alternative solution but I think we can make it better
    for(var idx= 0, len=configs.length; idx < len; idx++) {
      var config  = configs[idx];
      // The problem with using the below code is: there are situations where we can use cache for model under
      // one call and don't use cache for model under a different call. Eg: cms/a and cms/aidQ and cms/slideshow
      // - all the call uses CmsAModelClass but it is not cached under cms/a.
//      var cls, name = twcUtil.capitalize(config.recordType + config.recordName +'ModelClass');
//      try {
//        cls = $injector.get(name);
//        if(cls && cls.prototype.isCacheable === false) {
//          return false;
//        }
//      } catch(e) {}
      if( ('recordType' in config && 'cache' in dsxclient_config[config.recordType] && dsxclient_config[config.recordType].cache === false) ||
        ('recordType' in config && dsxclient_config[config.recordType] && dsxclient_config[config.recordType]['recordConfig'] && dsxclient_config[config.recordType]['recordConfig'][config.recordName] && dsxclient_config[config.recordType]['recordConfig'][config.recordName].cache === false) ||
        ('cache' in config && config.cache === false) ) {
        return false;
      }
    }
    return true;
  }

  function sortConfigs( newConfigs ) {
    return newConfigs.sort(function(config1, config2) {
      if('recordName' in config1 && 'recordName' in config2) {
        if (config1.recordName === config2.recordName) {
          return 0;
        }
        return ((config1.recordName < config2.recordName) ? -1 : 1);
      }
      return 0;
    });
  }


  /**
   * Create Custom Dsx Promise
   * @param promises
   * @param requestConfigs
   * @returns {Promise}
   */
  function preparePromise( promises, requestConfigs) {
    // increment counter
    callCounter["increment"]();

    var mainPromise   = $q.all( promises);
    var defer         = $q.defer();
    var isLegacy      = twcUtil.some( requestConfigs, function(config) { return !('$id' in config); });
    var returnPromise = isLegacy ? defer.promise : new DsxClientPromise( mainPromise );

    mainPromise.then(function(body) {
      // process response first. there can be two types
      // 1) response coming from just promises, so you have to form the response object in proper form
      // 2) response coming from network.
      var response = body;
      if(!body || !angular.isArray(body) || !body.length || !angular.isObject(body[0]) || !('headers' in body[0])) {
        response = { lscache: false, status: 200, data : { body : body } };
      }
      else if( angular.isArray(body) && body.length ) {
        response = body[0];
      }

      // glue requirment to get parse time of weather data
      var isWeatherData = false;
      if (twcUtil.filter(requestConfigs, {
        recordName: 'MORecord'
      }).length > 0) {
        isWeatherData = true;
      }

      isWeatherData && window.glue && glue.timer('weatherdata.parse', 'Time it takes to parse the HTTP response for MORecord into a model').start();

      // form DsxClientResponse for processing models.
      var dsxResponse = new DsxClientResponse( response, requestConfigs );

      if(isLegacy) {
        defer.resolve( dsxResponse );
      }
      else {
        // set alias in result object
        var results = {};
        twcUtil.each( requestConfigs, function( ido ) {
          if('$id' in ido) {
            results[ido.$id] = dsxResponse.getModel( ido );
          }
        });

        isWeatherData && window.glue && glue.timer('weatherdata.parse').end();

        // set response as well in results, otherwise invoker will choke for previously designed stuffs.
        results.response = dsxResponse;
        returnPromise.$setResults( results );
      }
    });

    if(isLegacy) {
      mainPromise['catch'](function( err ) {
        defer.reject( err );
      });
    }

    // decrement the counter
    returnPromise["finally"](function() {
      callCounter["decrement"]();
    });

    return returnPromise;
  }

  /**
   * Public methods are to be wrapped in the object below.
   */
  return {

    /**
     * Exposing the get URL path to be reused in testing too.
     *
     * @param configs
     * @returns {string}
     */
    getURLPath : function( configs ) {
      return dsxclient_config.url + AggregateUtil.getAggregatedURL( configs );
    },

    /**
     * Exposing the get URL params to be reused in testing.
     * @param configs
     * @param additionalParams
     * @returns {*}
     */
    getURLParams: function( configs, additionalParams ) {
      // Transform custom params if they want to transform
      var custom_params = ParamUtil.parseParams(configs);

      var params = additionalParams;
      // Any explicit params can be passed here.
      if(!params) { params = {}; }
      angular.extend(params, dsxclient_config.params, custom_params);

      return params;
    },

    /**
     * The second exposed method to the outside world. The method takes in config array and params to make
     * the call using httpclient and set the models before returning response. The good thing is, we attach
     * logic to return models to the actual response and therefore, the developers will have access to raw
     * response as well. More power to the developers, Yay!
     *
     * @param configs - array of config objects
     * @param params - additional http params.
     * @returns {Promise}
     */
    execute : function( configs, params ) {

      var newConfigs = [], promises = [], canCache = dsxclient_config.cache && isCacheable( configs), cids = [];

      // Check cache and return promises.
      if( canCache ) {
        for(var idx= 0, len=configs.length; idx < len; idx++) {
          var config  = configs[idx], cid = RecordUtil.getUniqueKey( config ), isCached = false, localCachedItem = dsxLocalCache.get(cid);
          // check out local storage and create dummy promises if we have a valid storage.
          if(localCachedItem && !dsxPromisePool.hasDefer(cid)) {
            // Plug our local storage right into our promise pool.
            dsxPromisePool.createDefer(cid);
            dsxPromisePool.resolveDefer(cid, localCachedItem);
          }
          // Special case where the browser refresh did not happen for a long time and a module makes a call on a expired record.
          if(!localCachedItem && dsxLocalCache.isEnabled() && dsxPromisePool.getStatus(cid) === PromisePoolStatusCodes.RESOLVED) {
            dsxPromisePool.deleteDefer(cid);
          }
          if(dsxPromisePool.hasDefer(cid)) {
            isCached = true;
            // log the items thats going to come from cache.
            PcoPerf.logDsxCall(cid, true);
          }
          if(!isCached) { newConfigs.push(config); }
          promises.push(dsxPromisePool.getPromise(cid));
        }
        // sort configs
        newConfigs = sortConfigs(newConfigs);
      }
      else {
        newConfigs = configs;
      }

      if(newConfigs.length > 0) {
        // DSX ESI changes started restricting the number of records that can be aggregated. So, split it here and send for processing.
        var configChunks = twcUtil.chunk(newConfigs, 10), _self = this;

        angular.forEach(configChunks, function( configChunk ) {
          // Form a URL first based on the configs you got.
          var url = _self.getURLPath(configChunk), _initial = new Date();
          // Log perf info
          PcoPerf.logDsxCall("/" + url, false);

          var newparams = _self.getURLParams(configChunk, params);

          // Fire away ------> I mean, the network call to DSX. Use httpclient to make calls.
          var ajaxPromise = httpclient.jsonp(url, {params : newparams});

          ajaxPromise.then(function(response) {
            /* Use closure technique to have responseMap live after this function */
            var rawResponseMap = {}, _final = new Date();
            PcoPerf.logDsxCall("/" + url, false, (_final.getTime() - _initial.getTime())/1000);

            if( response && response.data && response.data.body && angular.isArray(response.data.body) ) {
              var responseBody = response.data.body;
              for(var rcount = 0, responselen = responseBody.length ; rcount < responselen; rcount++) {
                var recordBody  = responseBody[rcount];
                if('id' in recordBody) {
                  rawResponseMap[recordBody.id] = recordBody;
                }
              }
            }
            for(var ccount = 0, configlen = configChunk.length ; ccount < configlen; ccount++) {
              var config = configChunk[ccount], configId = RecordUtil.getRecordID(config), cacheId = RecordUtil.getUniqueKey(config), configResponse = rawResponseMap[configId];
              // resolve or reject defers appropriately
              if(canCache) {
                // Write to local storage
                dsxLocalCache.add(cacheId, configResponse);
                // The logic to resolve or defer is void because everybody is comfortable with null check in their then callback.
                // ('error' in configResponse && !('ignore_fail' in config) && !(config.ignore_fail)) ? dsxPromisePool.rejectDefer(configId, response) : dsxPromisePool.resolveDefer(configId, configResponse);
                // Always resolve it. Its a requirement for now.
                dsxPromisePool.resolveDefer(cacheId, configResponse);
              }
            }

            // We don't have to create ClientResponse here. If we do, it will be a duplicate response.
            // return new DsxClientResponse(response, newConfigs);
          });

          /**
           * Catch the ajax error and reject the defers.
           */
          ajaxPromise['catch']( function( error ){
            if(canCache) {
              for(var count = 0 ; count < configChunk.length; count++) {
                var config = configChunk[count], cid = RecordUtil.getUniqueKey( config );
                dsxPromisePool.rejectDefer(cid, error);
              }
            }
          });

          /**
           * If not cacheable, return the ajax or http promise directly to client. Let's not mess up with something
           * we are not supposed to handle.
           */
          if(!canCache) {
            promises.push(ajaxPromise);
          }
        });
      }

      // return a custom promise
      return promises.length ? preparePromise(promises, configs) : null;
    }
  };
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 3/28/14
 * Time: 12:30 PM
 * Comments: Many thanks to TVo's initial design proposal with DsxCall. However, the only
 * drawback with that approach is, creating a promise of custom promise of promise pools.
 * The following will allow backward compatibility and also use one custom promise.
 *
 */

twc.shared.apps.factory('DsxClientPromise',['TwcClass', '$injector', '$q', 'twcUtil',function(TwcClass, $injector, $q, twcUtil){

  return TwcClass.extend({
    /**
     * constructor - setup attributes in this and kickoff promise setup.
     * @param promise
     */
    constructor: function(promise) {
      this._promise = promise;
      this._results = {};
    },

    /**
     * Used internally
     */
    $setResults: function(results) {
       twcUtil.extend(this._results, results);
    },

    /**
     * Support for then method for a promise.
     * @param done
     * @param error
     * @returns {*}
     */
    then: function(done, error) {

      var methods = [], self = this;
      methods.push(done && function() {
        return $injector.invoke(done, null, self._results);
      });

      methods.push(error && function() {
        return error.apply(null,arguments);
      });

      return this._promise.then.apply(this._promise, methods);
    },

    // support for legacy operations - catch and finally

    'catch': function(callback) {
      return this.then(null, callback);
    },

    'finally': function(callback) {
      return this._promise['finally'](callback);
    },

    /**
     * Method to use for adding results to scope auto-magically.
     * @param obj
     * @returns {*}
     */
    addResultsTo: function(obj) {
      var self = this;
      this._promise.then(function() {
        twcUtil.extend(obj, self._results);
      });
      return this;
    }
  });
}]);;
/**
 * Author: ksankaran (Velu)
 * Date: 12/6/13
 * Time: 1:11 PM
 * Comments:
 */

twc.shared.apps.value('PromisePoolStatusCodes', {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected'
}).factory('PromisePool',['TwcClass', '$q', 'PromisePoolStatusCodes',function (TwcClass, $q, PromisePoolStatusCodes) {
  return TwcClass.extend({
    construct: function () {
      this.data   = {};
      this.status = {};
    },

    getPromise: function (key) {
      this.createDefer(key);
      return this.data[key].promise;
    },

    hasDefer: function (key) {
      return (key in this.data);
    },

    createDefer: function (key) {
      if (!this.hasDefer(key)) {
        this.data[key]    = $q.defer();
        this.status[key]  = PromisePoolStatusCodes.PENDING;
      }
    },

    deleteDefer: function (key) {
      delete this.data[key];
      delete this.status[key];
    },

    resolveDefer: function (key, data) {
      if (this.hasDefer(key)) {
        this.data[key].resolve(data);
        this.status[key]  = PromisePoolStatusCodes.RESOLVED;
      }
    },

    rejectDefer: function (key, data) {
      if (this.hasDefer(key)) {
        this.data[key].reject(data);
        this.status[key]  = PromisePoolStatusCodes.REJECTED;
      }
    },

    getStatus: function (key) {
      return this.status[key];
    }
  });
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 12/5/13
 * Time: 2:22 PM
 * Comments:
 */

twc.shared.apps.factory('MemCache',['TwcClass',function (TwcClass) {
  return TwcClass.extend({
    construct: function () {
      this.data   = {};
    },

    put: function (key, value) {
      this.data[key] = value;
    },

    hasKey: function (key) {
      return (key in this.data);
    },

    get: function (key) {
      return this.data[key];
    }
  });
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 2/6/14
 * Time: 9:30 AM
 * Comments:
 */

twc.shared.apps.factory('DsxClientResponse',['TwcModel', '$log', 'twcConfig', 'twcUtil', '$injector', 'RecordUtil', '$parse', function(TwcModel, $log, twcConfig, twcUtil, $injector, RecordUtil, $parse){

  var dsxclient_config = twcConfig.dsxclient;

  /**
   * This method is used by the promise response handler to generate model objects to be attached to the response.
   * The logic is to figure out what type of model it needs to be based on the record config, loaded models and so on.
   *
   * @param recordBody - the RAW response for one record.
   * @param config - configuration that resulted in above response body
   * @returns {*}
   */
  function getModelObject( recordBody, config ) {
    // Do not process the error bodies. Let the developer figure it out.
    if(!recordBody || !recordBody.id || 'error' in recordBody  || !(recordBody.doc)) { return null; }

    // Figure out class name, recordConfig and recordName.
    var className, recordConfig, recordName = "DsxModel";
    if('recordType' in config && 'recordName' in config) {
      var recordType = config.recordType;
      recordName = config.recordName;
      // Pull out the record config for the recordType and recordName
      recordConfig = dsxclient_config[recordType].recordConfig[recordName];
      // Figure out what kind of model you want to create. If we are not able to find the appropriate model based
      // on name, create a generic ResponseModel.
      className = (twcUtil.capitalize(recordType) + twcUtil.capitalize(recordName) + "ModelClass");
      // record config override
      if(recordConfig && 'model' in recordConfig) {
        className = recordConfig.model;
      }
    }

    // config overrides
    if(config && 'model' in config) {
      className = config.model;
    }

    var ModelClass = (!!className) && $injector.has(className) && $injector.get(className);
    if(!ModelClass) {
      $log.debug( (className ? className : "_NULL_") + " not found. Returning RAW response.");
      className = 'ResponseModel';
      ModelClass = $injector.get('ResponseModel').extend({});
      ModelClass.prototype.recordType = recordName;
    }
    var models = [], header, data, index, length;
    /**
     * There are three types of responses from DSX right now and I'm going to call them as follows
     * simple: The response have data (**Data) and header (**Hdr). Both of them are objects.
     * collection: The response have Data and Hdr. Header is an object and data is array.
     * array: The response is an array. Each element in the array may/may not have Hdr and Data.
     *
     * For simple, we create a single model class with header and data. If the response is different, they have to
     * overwrite the method setResponse in the model to process differently (Eg: WxdLocModel). Otherwise, the code
     * will attach Hdr to the header attribute and Data to the data attribute.
     * For collection, we create array of models and each model will have header and data. Yes, header is duplicated
     * for all models to achieve consistency.
     * For array, we create dump the response to the model class and let model class take care of parsing the response
     * and assigning the data. Eg: QlocModel.
     */

    var defaultModelCreation = true;
    if(recordConfig && recordConfig.type && recordConfig.type === "collection") {
      // collection. This needs to be a record. Otherwise we want the model to take care of processing.
      if(recordName.indexOf("Record") !== -1 || 'responseFormat' in recordConfig) {
        defaultModelCreation = false;
        var recordDataName, recordDataHdr;
        if(recordConfig.responseFormat) {
          recordDataName  = recordConfig.responseFormat.data;
          recordDataHdr   = recordConfig.responseFormat.header;
        }
        else {
          recordDataName = /(.*)Record/.exec(recordName)[1] + 'Data';
          recordDataHdr  = /(.*)Record/.exec(recordName)[1] + 'Hdr';
        }
        header = recordBody.doc[recordDataHdr];
        data   = recordBody.doc[recordDataName];
        if(!data) {
          try {
            data = $parse(recordDataName)(recordBody.doc);
          }
          catch(err) {
            $log.debug("Error trying to parse the record data: ", recordDataName);
          }
        }
        for(index= 0, length = data.length; index < length; index++) {
          var obj = {};
          obj[recordDataHdr]  = {};
          obj[recordDataName] = data[index];
          models.push( new ModelClass( obj, className ) );
        }

        var CollectionClass = $injector.get('RecordCollection').extend({});
        CollectionClass.prototype.recordType = recordName;

        return new CollectionClass({items : models, header : header});
      }
    }
    else if(recordConfig && recordConfig.type && recordConfig.type === "array") {
      defaultModelCreation = false;
      // array
      data = recordBody.doc;
      if(angular.isArray(data)) {
        for(index= 0, length = data.length; index < length; index++) {
          models.push( new ModelClass( data[index], className ) );
        }
      }
      return models;
    }

    if(defaultModelCreation) {
      // simple
      return new ModelClass( recordBody.doc, className );
    }
  }

  /**
   * The basic response model to get the RAW data.
   */

  return TwcModel.extend({
    construct       : function(response, configs) {
      this.attrs = response;
      this.attrs.responseMap = {};
      this.attrs.rawResponseMap = {};
      this.process(response, configs);
    },

    process         : function( response, configs ) {
      var responseMap = this.get('responseMap'), rawResponseMap = this.get('rawResponseMap');
      // process response objects
      if( response && response.data && response.data.body && angular.isArray(response.data.body) ) {
        var responseBody = response.data.body;
        for(var rcount = 0, responselen = responseBody.length ; rcount < responselen; rcount++) {
          var recordBody  = responseBody[rcount];
          if(recordBody && 'id' in recordBody) {
            rawResponseMap[recordBody.id] = recordBody;
          }
        }
      }
      // Map from response to configs
      if(configs && configs.length > 0) {
        var _self = this;
        angular.forEach(configs, function(config) {
          var configId = RecordUtil.getRecordID(config), cacheId = RecordUtil.getUniqueKey(config);
          responseMap[cacheId] = rawResponseMap[configId];
        });
      }
    },

    getModel      : function( config ) {
      if( angular.isObject(config) ) {
        var rawResponse = this._get('responseMap')[ RecordUtil.getUniqueKey( config ) ];
        return rawResponse ? getModelObject( rawResponse, config ) : null;
      }
      // default return
      return null;
    },

    getLocation   : function( locId ) {
      return this.getModel({recordType : "wxd", recordName : "loc", fullLocId : locId});
    }
  });
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 11/12/13
 * Time: 11:38 AM
 * Comments:
 */

twc.shared.apps.factory('httpclient',['$http', 'twcUtil','PcoDevice', 'twcConfig',  function ($http, twcUtil, PcoDevice, twcConfig) {
  var $ = angular.element;

  var scriptLoader = (function () {
    var head = document.head || jQuery('head')[0] || document.documentElement;

    /**
     * The logic below was excerpted and modified from jquery-1.10.2 line 8474
     * The reason why we don't use jQuery is that it does not allow us to modify the attributes
     * on the script tag and it forces removal of a scrip tag after the content is loaded, while some 3rd party
     * library needs the info from the attributes on the script tag itself in order to work.
     * @param s
     * @param callback
     * @param script
     * @returns {*}
     * @private
     */
    function _getScript(s, callback, script) {
      script.async = true;

      if (s.scriptCharset) {
        script.charset = s.scriptCharset;
      }

      script.src = s.url;

      // Attach handlers for all browsers
      script.onload = script.onreadystatechange = function (_, isAbort) {

        if (isAbort || !script.readyState || /loaded|complete/.test(script.readyState)) {

          // Handle memory leak in IE
          script.onload = script.onreadystatechange = null;

          // Remove the script
          if (script.parentNode && s.remove) {
            script.parentNode.removeChild(script);
          }

          // Callback if not abort
          if (!isAbort) {
            callback(200, 'success');
          }
        }
      };

      // Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
      // Use native DOM manipulation to avoid our domManip AJAX trickery
      head.insertBefore(script, head.firstChild);

      return script;
    }

    return {
      cache: {},
      getScript: function (settings) {
        var url, callback, attrs;
        if (!angular.isObject(settings)) {
          settings = {
            url: arguments[0],
            callback: arguments[1],
            attrs: arguments[2]
          };
        }

        twcUtil.defaults(settings, {
          url: '',
          callback: angular.noop,
          attrs: {},
          remove: true
        });

        url       = settings.url;
        callback  = settings.callback;
        attrs     = settings.attrs;

        if (this.cache[url]) {
          // If the script is already being loaded,
          // add the callback to the promise
          this.cache[url].done(callback);
        } else {
          var deferred = this.cache[url] = $.Deferred();
          deferred.done(callback);
          var script = $(document.createElement('script'));
          script.attr(attrs);
          _getScript(settings, function () {
            deferred.resolve();
          }, script[0]);
        }
      }
    };
  })();

  return {
    /**
     * Wrapper of $http.jsonp
     * @param url
     * @param config
     * @returns {HttpPromise}
     */
    jsonp: function (url, config) {

      if (url.indexOf('MORecord') > -1) {
        window.glue && glue.timer('weatherdata.request', 'Time it takes to make a request for MORecord');
      }

      if (PcoDevice.getBrowserName() === 'Firefox' && url.match(/wxd\/|cs\//)) {
        jQuery.extend(config.params, {
          '_': new Date().getTime()
        });
      }
      return $http.jsonp(url, config)
        .then(function (data) {
          window.glue && glue.timer('weatherdata.request').end();
          return data;
        });
    },

    /**
     *
     * @param settings
     *    url       - The URL of the script,
     *    callback  - Callback when the script is loaded,
     *    attrs     - The attributes that will be attached to the script tag
     *    remove    - defaults to true. Set to false if you don't want the script tag to be removed
     *                after its content is fully loaded
     *
     */
    getScript: function (settings) {
      return scriptLoader.getScript.apply(scriptLoader, arguments);
    }
  };
}]);
;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 9/9/13
 * Time: 10:43 AM
 * Comments: Configuration for dsxclient.
 */

twc.shared.apps.config(['twcConfigProvider',function (twcConfigProvider) {
  twcConfigProvider.add({dsxclient:{
    cache: true,
    cache_size: 70,
    cache_expiry: 60,
    locale: TWC.Configs.dsx.locale,
    url: TWC.Configs.dsx.host,
    version: 'v2',
    cmsVersion: TWC.Configs.dsx.cmsVersion,
    addLocale: ((TWC.Configs.dsx.cmsVersion === 'v4' && TWC.Configs.dsx.locale) ? true : false),
    params: {
      'jsonp': 'JSON_CALLBACK',
      'api': TWC.Configs.dsx.apiKey
    },
    wxd:{
      records: {
        /**
         * Astronomical Record
         */
        astro: 'Astro',
        /**
         * FAA Airport Delay
         */
        airportDelay: 'ADRecord',
        /**
         * Observation data
         */
        observation: 'MORecord',
        /**
         * Daily Forecast
         */
        dailyForecast: 'DFRecord',
        /**
         * Hourly Domestic and International Forecasts
         */
        hourly: 'DHRecord',
        /**
         * Daypart Domestic and International Forecasts
         */
        daypart: 'DDRecord',
        /**
         * Daily International Forecasts
         */
        dailyInternational: 'DIRecord',
        /**
         * Air quality
         */
        airQuality: 'ESRecord',
        /**
         * Flight Arrivals
         */
        flightArrival: 'FARecord',
        /**
         * Flu Data
         */
        flu: 'FURecord',
        /**
         * Bulletins
         */
        bulletin: 'BERecord',
        /**
         * Nowcast Forecasts
         */
        nowcast: 'NCRecord',
        /**
         * Intraday Domestic and International Forecasts
         */
        intraday: 'IFRecord',
        /**
         * Index Data
         */
        index: 'IDRecord',
        /**
         * Interstate Data
         */
        interstate: 'Interstate',
        /**
         * Moon Phase Data
         */
        moon: 'Moon',
        /**
         * Lightning Data
         */
        lightning: 'LGRecord',
        /**
         * Past Obs Avg Data
         */
        pastObsAvg: 'PastObsAvg',
        /**
         * Precipitation
         */
        precipitation: 'PERecord',
        /**
         * Pollen Data
         */
        pollen: 'Pollen',
        /**
         * Pollen Observed Data
         */
        pollenObserved: 'PLRecord',
        /**
         * Hurricane Tracker Data
         */
        hurricaneTracker: 'HTRecord',
        /**
         * Tide Data
         */
        tide: 'TIRecord',
        /**
         * UK Pollen Data
         */
        pollenUk: 'UPRecord',
        /**
         * Hurricane Projection Data
         */
        hurricaneProjection: 'HPRecord',
        /**
         * Ski Resort Data
         */
        ski: 'SKRecord',
        /**
         * Storm Report Data
         */
        stormReport: 'SRRecord',
        /**
         * Location Full info
         */
        locFull: 'LFRecord',
        /**
         * Location info
         */
        loc: 'loc',
        /**
         * Marine Forecast
         */
        marine: 'WMRecord',
        /**
         * Polygonal Warnings
         */
        wv: 'WVRecord',
        /**
         * Polygonal Warnings
         */
        ww: 'WWRecord',
        /**
         * Zip Code mapping
         */
        zipMapping: 'ZFRecord',
        /**
         * Daily and Monthly Climatology
         */
        climo: 'Climatology',
        /**
         * SurePoint - Mappoint
         */
        mappoint: 'mappoint',
        /**
         * When Will It Rain
         */
        wwir: 'wwir',
        /**
         * Hirad Data (Trupoint Data for hourly)
         */
        hiradff: 'HiRadFF',
        /**
         * States with Active Alerts
         */
        alertStates: 'AlertsStates',
        /**
         * Active Alerts by AreaId
         */
        alertArea: 'AlertsArea',
        /**
         * Affected Locations for alert
         */
        alertLocations: 'AlertLocations',
        /**
         * Farming Almanac (cumulative historical temp, precip data)
         */
        farmingAlmanac: 'FarmingAlmanacRecord',
        /**
         * National Flu Data
         */
        NationalFlu: 'NationalFlu',
        /**
        * Past Flu Data
        */
        PastFlu: 'PastFlu',
        /**
         * 15 Day Forecast Data
         */
        fifteenDayForecast: 'FifteenDayForecast',
        /**
         * Pollen Observation Data
         */
        ObservedPollen: 'PLRecord',
        /**
         * Past Pollen Data
         */
        PastPollen: 'PastPollen',
        /**
         * Pollen Hot Spots
        */
        PollenHotSpots: 'PollenHotSpots',
        /**
         * Hurricane Tracker Record
         */
        HurricaneTracker: 'HTRecord',
        /**
         * Hurricane Projected Path Record
         */
        HurricanePath: 'HPRecord',
        /**
         * Active Tropical Storm ID
         */
        ActiveTrop: 'ActiveTrop',
        /**
        				 * Tropical Storm Record
        				 */
        TropicalStorms: 'TropicalStorms',

        /**
         * Storm Report Records
         */
        SRRecord: 'SRRecord',

        /**
         * Tropical Bulletins
         */
        TropicalBulletins: 'TropicalBulletins',

        /**
         * Storm Map Record
         */
        StormMap: 'StormMap'

      },

      defaultPathFormat: function (ido, thisConfig) {
        return ['wxd',ido.version || thisConfig.version,ido.recordName,ido.locale || thisConfig.locale,ido.fullLocId];
      },

      recordConfig: {
        AlertsStates: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,'alerts','states'];
          }
        },
        AlertsArea: {
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,'alerts','area', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        AlertLocations: {
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,'alerts','alertLocations', ido.locale || thisConfig.locale, ido.twcIId];
          }
        },
        FarmingAlmanacRecord: {
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, 'FarmingAlmanac', ido.locale || thisConfig.locale, ido.date, ido.fullLocId];
          }
        },
        BERecord: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            if (ido.areaId && ido.office && ido.phenomena && ido.significance && ido.etn) {
              return ['wxd', ido.version || thisConfig.version, ido.recordName,ido.locale || thisConfig.locale, ido.areaId, ido.office, ido.phenomena, ido.significance, ido.etn];
            }
            return ['wxd',ido.version || thisConfig.version,ido.recordName,ido.locale || thisConfig.locale,ido.fullLocId];
          }
        },
        DDRecord: {
          type: 'collection'
        },
        DFRecord: {
          type: 'collection'
        },
        DHRecord: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, 'DHRecord', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        PERecord: {
          type: 'collection'
        },
        IFRecord: {
          type: 'collection'
        },
        DIRecord: {
          type: 'collection'
        },
        Pollen: {
          type: 'collection'
        },
        PollenHotSpots: {
          type: 'array'
        },
        PLRecord: {
          type: 'simple'
        },
        IDRecord: {
          type: 'collection',
          // index type added to path
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.indexType || 1, ido.fullLocId];
          }
        },
        ESRecord: {
          type: 'collection',
          //Air Quality Type added to path
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.airQualityType || 'F', ido.fullLocId];
          }
        },
        loc: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName,ido.locale || thisConfig.locale, ido.fullLocId || (ido.lat + "," + ido.lng)];
          }
        },
        Moon: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,ido.recordName,ido.locale || thisConfig.locale,ido.days || 1,ido.fullLocId];
          }
        },
        Climatology: {
          type: 'array',
          // month, date and Count added to the path
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.month + (ido.date ? ("-" + ido.date) : ""),ido.count || 1,ido.fullLocId];
          }
        },
        PastObsAvg: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.date, ido.numOfDays || 1, ido.fullLocId];
          }
        },
        mappoint: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,ido.recordName,ido.locale || thisConfig.locale,ido.key];
          }
        },
        HiRadFF: {
          type: 'collection',
          model: 'WxdHiRadFFModelClass',
          responseFormat: {"data": "HiRadFFData", "header": "HiRadFFHdr"},
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,ido.recordName,ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        Astro: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.date, ido.numOfDays || 1, ido.fullLocId];
          }
        },
        NationalFlu: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            if (ido.date) {
              return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.date];
            } else {
              return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale];
            }
          }
        },
        PastFlu: {
          type: 'collection,',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.state];
          }
        },
        FifteenDayForecast: {
          type: 'collection',
          model: 'WxdFifteenDayForecastModelClass',
          responseFormat: {"data": "fcstdaily15alluoms.forecasts", "header": "metadata"},
          pathFormat: function (ido, thisConfig) {
            return ['wxd',ido.version || thisConfig.version,ido.recordName ? '15DayForecast' : '',ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        PastPollen: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.date, ido.numOfDays || 1, ido.fullLocId];
          }
        },
        HTRecord: {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.stormId];
          }
        },
        HPRecord: {
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale, ido.stormId];
          }
        },
        ActiveTrop: {
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName,ido.locale || thisConfig.locale];
          }
        },
        TropicalStorms: {
          pathFormat: function (ido, thisConfig) {
            var _return = ['wxd', ido.version || thisConfig.version, ido.recordName];
            if (ido.years) {
              _return.push(ido.years);
            }
            return _return;
          }
        },
        SRRecord: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            var _return = ['wxd', ido.version || thisConfig.version, ido.recordName, ido.locale || thisConfig.locale];
            (ido.type !== "none") ? _return.push("type", ido.type) : _return.push("type", "none");
            (ido.date !== "none") ? _return.push("date", ido.date) : _return.push("date", "none");
            (ido.state !== "none") ? _return.push("state", ido.state) : _return.push("state", "none");

            if (ido.start !== "none") {
              _return.push("pg", ido.start);
              if (ido.maxPerPage !== "none") {
                _return.push(ido.maxPerPage);
              }
            }

            return _return;
          }
        },
        TropicalBulletins: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName];
          }
        },
        StormMap: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['wxd', ido.version || thisConfig.version, ido.recordName, ido.stormId];
          }
        }
      }
    },

    q: {
      recordConfig: {
        loc: {
          type:  'array',
          pathFormat: function (ido, thisConfig) {
            var regions = [];
            if (ido.country && ido.region && ido.key) {
              regions.push(ido.country,ido.region,ido.key);
            } else {
              if (ido.locType) {
                regions.push(ido.locType);
              }
              regions.push(ido.key);
            }
            return ['q', ido.version || thisConfig.version, 'loc', ido.locale || thisConfig.locale].concat(regions);
          }
        },
        "loc.near": {
          type:  'collection',
          model: 'QLocModelClass',
          pathFormat: function (ido, thisConfig) {
            return ['q',ido.version || thisConfig.version,'loc.near',ido.locale || thisConfig.locale,ido.locType,ido.zoom,ido.lat + ',' + ido.lon];
          }
        }
      }
    },

    survey: {
      recordConfig: {
        getEverything: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['v1' || thisConfig.version, 'survey'];
          }
        },
        getTemplate: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['v1' || thisConfig.version, 'survey', 'template'];
          }
        },
        getResults: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['v1' || thisConfig.version, 'survey', 'results'];
          }
        },
        setResults: {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['v1' || thisConfig.version, 'survey', 'results'];
          }
        }
      }
    },

    cms: {
      defaultPathFormat: function (ido, thisConfig) {
        if (thisConfig.addLocale) {
          return ["cms", ido.cmsVersion || thisConfig.cmsVersion, "assets", thisConfig.locale];
        }
        return ["cms", "assets"];
      },

      recordConfig: {
        a: {

          type: 'array',

          transformParamMap: {
            "DMA": "tags.geo.DMA",
            "wxlow": "tags.wx.low",
            "wxhigh": "tags.wx.high",
            "keyword": "tags.keyword",
            "city": "tags.geo.city",
            "state": "tags.geo.state",
            "loc": "tags.loc"
          },

          transformParam: function (param, val, cond) {
            return (param + ":$" + cond + "(" + val + ")");
          },

          paramFormat: function (paramMap) {
            var result = {};
            if (paramMap.query) {
              var queries = paramMap.query;
              var qparams = [];
              for (var idx = 0, len = queries.length; idx < len; idx++) {
                var query = queries[idx], subqparams = [], _self = this;
                for (var key in query) {
                  if (query.hasOwnProperty(key)) {
                    var rawValue = query[key];
                    var keyparts = key.split("|"), cond = (keyparts.length > 1 ? keyparts[1] : 'in');
                    key = keyparts[0];

                    var valueStr = '';
                    if (angular.isArray(rawValue)) {
                      var value = rawValue.slice(0);
                      for (var counter = 0, vlen = value.length; counter < vlen; counter++) {
                        value[counter] = ("'" + value[counter] + "'");
                      }
                      valueStr = value.join(",");
                    } else {
                      valueStr = "'" + rawValue + "'";
                    }
                    subqparams.push(
                      _self.transformParam((_self.transformParamMap[key] ? _self.transformParamMap[key] : key), valueStr, cond)
                    );
                  }
                }
                qparams.push(subqparams.join(";"));
              }
              if (qparams.length > 0) {
                result["q"] = qparams;
              }
            }
            if (typeof paramMap.start !== 'undefined' && typeof paramMap.end !== 'undefined') {
              result["pg"] = paramMap.start + "," + paramMap.end;
            } else {
              result["pg"] = "0,10";
            }
            return result;
          }
        },

        aidQ: {
          model: "CmsAModelClass",
          pathFormat: function (ido,thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, 'a', thisConfig.locale, ido.assetId];
            }
            return ['cms','a',ido.assetId];
          }
        },

        aImg: {
          model: "CmsAModelClass",
          pathFormat: function (ido,thisConfig) {
            return ['cms','a',ido.assetId];
          }
        },

        videoAssetWithColl: {
          model:"VideoAssetModelClass",
          pathFormat: function (ido,thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms',thisConfig.cmsVersion, 'asset-collection', thisConfig.locale, ido.assetId];
            }
            return ['cms','asset-collection',ido.assetId];
          }
        },

        ugcAssetWithColl: {
          model:"UGCAssetModelClass",
          pathFormat: function (ido,thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms',thisConfig.cmsVersion, 'asset-collection', thisConfig.locale, ido.assetId];
            }
            return ['cms','asset-collection',ido.assetId];
          }
        },

        ugc: {
          model: "UGCAssetModelClass",
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, 'a', thisConfig.locale, ido.assetId];
            }
            return ['cms','a',ido.assetId];
          }
        },

        video: {
          model: "VideoAssetModelClass",
          pathFormat: function (ido, thisConfig) {
             if (thisConfig.addLocale) {
               return ['cms', thisConfig.cmsVersion, 'a', thisConfig.locale, ido.assetId];
             }
             return ['cms','a',ido.assetId];
           }
        },

        slideshow: {
          model: "CmsAModelClass",
          pathFormat: function (ido) {
            return ['cms','assets','slideshow',ido.assetId,(ido.startIndex || 0) + ',' + (ido.count || 50)];
          }
        },

        nextarticle: {
          model: "CmsNextArticleModelClass",
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms',thisConfig.cmsVersion, 'nextArticle',thisConfig.locale, ido.assetId];
            }
            return ['cms','nextArticle',ido.assetId];
          }
        },

        collections: {
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, 'collections', thisConfig.locale, ido.path];
            }
            return ['cms', 'collections', ido.path];
          }
        },

        adDataServer: {
          model: "CmsAdDataServerPoiClass",
          type: "array",
          pathFormat: function (ido) {
            return ['cms', 'AdDataServer', 'poi', ido.sponsorId, ido.tileId];
          }
        },

        BreakingNow: {
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, "settings", thisConfig.locale, "breakingnow"];
            }
            return ['cms', ido.version || thisConfig.version, "settings/breakingnow"];
          }
        },

        AssetList: {
          model: "CmsAssetListModelClass",
          type: "array",
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, 'asset-list',thisConfig.locale, ido.listName, ((ido.startIndex || 0) + ',' + (ido.count || 20))];

            }
            return ['cms', ido.version || thisConfig.version, 'asset-list', ido.listName, ((ido.startIndex || 0) + ',' + (ido.count || 20))];
          }
        },

        orderedlist: {
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, "orderedlist",  thisConfig.locale, "video", ido.path];
            }
            return ['cms', "orderedlist/video", ido.path];
          }
        },

        playlist: {
          model: 'VideoAssetModelClass',
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, "orderedlist",  thisConfig.locale, "video", ido.path];
            }
            return ['cms', "orderedlist/video", ido.path];
          }
        },

        affiliateVideos: {
          pathFormat: function (ido, thisConfig) {
            if (thisConfig.addLocale) {
              return ['cms', thisConfig.cmsVersion, "dma",  thisConfig.locale, ido.dma];
            }
            return ["cms",ido.version || thisConfig.version,"dma",ido.dma];

          }
        }

      }
    },

    cs: {
      recordConfig: {
        datetime: {
          pathFormat: function (ido, thisConfig) {
            return ['cs', ido.version || thisConfig.version, 'datetime', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        }
      }
    },

    maps: {
      records: {
        series: 'series',
        radar: 'radar',
        rwi: 'rwi',
        hiradClouds: 'hirad_clouds',
        hiradTemp: 'hirad_temp',
        hiradWindSpeed: 'hirad_windSpeed',
        hiradUV: 'hirad_UV'
      },
      recordConfig: {
        series: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series'];
          }
        },
        radar: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/radar'];
          }
        },
        rwi: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/rwi'];
          }
        },
        hirad_clouds: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/hirad_clouds'];
          }
        },
        hirad_temp: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/hirad_temp'];
          }
        },
        hirad_windSpeed: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/hirad_windSpeed'];
          }
        },
        hirad_UV: {
          pathFormat: function (ido, thisConfig) {
            return ['maps', ido.version || thisConfig.version, 'i/series/hirad_UV'];
          }
        }
      }
    },

    "xweb": {
      records: {
        /**
         * Web Daily Forecast
         */
        webdailyForecast: 'WebDFRecord',

        /**
         * Web Hourly Forecast
         */
        webhourly: 'WebDHRecord',

        /**
         * Loc Search
         */
        loc: 'loc',
        webLoc: 'WebLoc',
        commuter: 'CommutercastRecord',
        social: 'social',
        photos: 'photos',
        titanDaily: 'TitanDaily'
      },
      recordConfig: {
        "WebDFRecord": {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['x', ido.version || thisConfig.version, 'web/WebDFRecord', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        "TitanDaily": {
          type: 'collection',
          model: "XwebWebDFRecordModelClass",
          responseFormat: {"data": "WebDFData", "header": "WebDFHdr"},
          pathFormat: function (ido, thisConfig) {
            return ['x-web', ido.version || thisConfig.version, 'titan-daily', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        "CommutercastRecord": {
          pathFormat: function (ido, thisConfig) {
            return ['x-web',ido.version || thisConfig.version,'commutercast',ido.locale || thisConfig.locale,ido.hourIndex,ido.fullLocId];
          }
        },
        "WebDHRecord": {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['x', ido.version || thisConfig.version, 'web/WebDHRecord', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        },
        "social": {
          pathFormat: function (ido, thisConfig) {
            return ['x', ido.version || thisConfig.version, 'social', ido.path];
          }
        },
        "photos": {
          model: 'XwebPhotosModelClass',
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['x', ido.version || thisConfig.version, 'social', ido.path, [ido.pageStart, ido.pageEnd].join(',')];
          }
        },
        "WebLoc": {
          cache: false,
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            var path = [];
            if (ido.proximity) {
              path = ['x', ido.version || thisConfig.version, 'web/loc.near',ido.locType,ido.zoom,ido.lat + ',' + ido.lon];
            } else {
              path = ['x', ido.version || thisConfig.version, 'web/loc', ido.locale || thisConfig.locale];

              if (ido.locTypes) {
                if (angular.isArray(ido.locTypes)) {
                  path.push.apply(path, ido.locTypes);
                } else {
                  path.push(ido.locTypes);
                }
              }

              if (ido.country) {
                /**
                 * To boost a country, take 'us' for example,
                 * just do {id:'us', boost:true} instead 'us'
                 */
                if (ido.country.code) {
                  path.push(ido.country.code + (ido.country.boost ? '^' : ''));
                } else {
                  path.push(ido.country);
                }
              }

              if (ido.region) {
                path.push(ido.region);
              }

              if (ido.term) {
                path.push(ido.term);
              }
            }
            return path;
          }
        },
        "WebLocNear": {
          type:  'array',
          pathFormat: function (ido, thisConfig) {
            return ['x',ido.version || thisConfig.version,'web/loc.near',ido.locale || thisConfig.locale,ido.locType,ido.zoom,ido.lat + ',' + ido.lon];
          }
        },
        "loc": {
          type:  'array',
          pathFormat: function (ido, thisConfig) {
            var regions = [];
            if (ido.locType) {
              regions.push(ido.locType);
            }
            regions.push(ido.key);
            return ['x',ido.version || thisConfig.version,'web','loc',ido.locale || thisConfig.locale].concat(regions);
          }
        }
      }
    },

    "xmweb": {
      records: {
        /**
         * Mobile Web Daily Forecast
         */
        mwebdailyForecast: 'MWebDFRecord'
      },
      recordConfig: {
        "MWebDFRecord": {
          type: 'collection',
          pathFormat: function (ido, thisConfig) {
            return ['x', ido.version || thisConfig.version, 'mweb/MWebDFRecord', ido.locale || thisConfig.locale, ido.fullLocId];
          }
        }
      }
    },
    u: {
      records: {
        user: 'user'
      },
      recordConfig: {
        user: {
          model: 'UUserIdModelClass',
          pathFormat: function (ido, thisConfig) {
            return ['u',ido.version || thisConfig.version, ido.userId];
          }
        }
      }
    },
    xreboot: {
      records: {
        /**
         * Bulletins
         */
        bulletin: 'BERecord'
      },
      recordConfig: {
        "BERecord": {
          type: 'array',
          pathFormat: function (ido, thisConfig) {
            return ['x',ido.version || thisConfig.version,'reboot',ido.recordName, ido.fullLocId];
          }
        }
      }
    }
  }});
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 11/12/13
 * Time: 2:26 PM
 * Comments: There are two basic classes defined here. The ResponseModel is just a twc class with a simple set response
 * method which sets data with the response. No other logical semantic methods attached. User will work on the RAW data.
 * The RecordModel on the other hand works with DSX records and hence it overrides the basic response model's parsing logic
 * alone. So, in future, if we land on a new service which responds a bit different, create a new super class here and have
 * your models extend from it.
 */
/* global twc */
/*jshint -W065 */

twc.shared.apps.factory('ResponseModel',['TwcClass',function(TwcClass){
  /**
   * The basic response model to get the RAW data.
   */
  return TwcClass.extend({
    setResponse : function( response ) {
      this.data   = response;
    },

    _get : function ( key ) {
      return this.data ? this.data[key] : '';
    },

    set : function ( map) {
      angular.extend(this.data, map);
    },

    construct : function( response, className ) {
      this.className = className;
      this.setResponse( response );
    }
  });
}]).factory('RecordModel',['ResponseModel',function(ResponseModel){
  /**
   * The DSXRecord Model which have the (RecordType)Data and (RecordType)Hdr.
   */
  return ResponseModel.extend({
    setResponse : function( response ) {
      var recordDataName = /(.*)Record/.exec(this.recordType)[1] + 'Data';
      var recordDataHdr  = /(.*)Record/.exec(this.recordType)[1] + 'Hdr';
      this.header = response[recordDataHdr];
      this.data   = response[recordDataName];
    },

    getHeader : function() {
      return this.header;
    },

    getRecordUpdatedTime : function( alternateKey ) {
      var key = '_procTmLocal';
      if(alternateKey) {
        key = alternateKey;
      }
      return ((this.header && this.header[key]) ? this.header[key] : '');
    }
  });
}]).factory('RecordCollection',['ResponseModel',function(ResponseModel){
  /**
   * The DSXRecord Model which have the (RecordType)Data and (RecordType)Hdr.
   */
  return ResponseModel.extend({
    setResponse : function( response ) {
      this.header = response.header;
      this.items  = response.items;
    },

    getHeader : function() {
      return this.header;
    },

    getItems : function() {
      return this.items;
    },

    getRecordUpdatedTime : function( alternateKey ) {
      var key = '_procTmLocal';
      if(alternateKey) {
        key = alternateKey;
      }
      return ((this.header && this.header[key]) ? this.header[key] : '');
    }
  });
}])
.factory('dsxModelUtils', ['pcoUser','$parse', function(pcoUser, $parse) {
  return {

    getPrecipValue: function(model, key) {
      return pcoUser.getPrecipUnit() === 'mm' ?
        (angular.isDefined(model._get('_'+key+'Mm')) ? model._get('_'+key+'Mm') : model._get(key)*25.4) :
        model._get(key);
    },

    getAccumulationValue: function(model, key) {
      return pcoUser.getAccumulationUnit() === 'cm' ?
        (angular.isDefined(model._get('_'+key+'Cm')) ? model._get('_'+key+'Cm') : model._get(key)*2.54) :
        model._get(key);
    },

    getWindDirectionText: function(model, key, forceEnglish) {
      return !forceEnglish ? model._get(key) : model._get('_'+key+'_en');
    },

    getPrecipFromValue: function(model, key) {
      var metricProperty = 'data.metric.' + key;
      var imperialProperty = 'data.imperial.' + key;

      if( pcoUser.getPrecipUnit() === 'mm' ) {
        var modelValue = $parse(metricProperty)(model);
        return angular.isDefined(modelValue) ? modelValue : $parse(imperialProperty)(model)*25.4;
      } else {
        return $parse(imperialProperty)(model);
      }
    }

  };
}]);
;
angular
  .module('gm_delivery_units', ['ngSanitize']);
;
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared',[]);
twc.shared.apps.directive('socialIcon',['twcUtil', 'socialIconFactory', function (twcUtil, socialIconFactory) {

  var wxIconDefinition = {
    priority: 0,
    replace: false,
    template: '<img/>',
    scope: {
      socialCode: '='
    },
    restrict: 'EA',
    link: function ($scope, $element) {
      // Add class to element.
      $element.addClass('social-icon');

      $scope.$watch('socialCode', function () {
        var img = angular.element('<img/>');
        img.attr('src', socialIconFactory.getIconUrl($scope.socialCode));
        img.attr('aria-hidden', 'true');
        img.attr('alt', socialIconFactory.getIconName($scope.socialCode).replace('-', ' '));
        $element.find('img').replaceWith(img);
      });

    }
  };
  return wxIconDefinition;
}]);
;
twc.shared.apps
  .factory('socialIconFactory', ['twcUtil', function (twcUtil) {
    var config = {
      basePath: '//s.w-x.co/',
      pngPath: 'png/',
      svgPath: 'svg/',
      svgzPath: 'svgz/',
      allowSVG: true,
      useSVGz: false
    };
    config.useSVG = config.allowSVG && Modernizr.svg;

    var iconCodeMap = {
      'facebook': ['0', '00'],
      'twitter': ['1', '01'],
      'google-plus': ['2', '02'],
      'instagram': ['3', '03'],
      'youTube': ['4', '04']
    };
    function getImageType(forcePNG) {
      return config.useSVG && !forcePNG ? (config.useSVGz ? '.svgz' : '.svg') : '.png';
    }
    function getImagePath(forcePNG) {
      return config.basePath;
    }

    return {
      getIconName: function (socialCode) {
        var iconName;
        if (twcUtil.isNumeric(socialCode) && socialCode >= 0 && socialCode <= 4) {
          // configure records
          var keys = twcUtil.keys(iconCodeMap);
          twcUtil.each(keys, function (key) {
            if (twcUtil.indexOf(iconCodeMap[key], socialCode.toString()) !== -1) {
              iconName = key;
            }
          });
        } else {
          iconName = 'na';
        }
        return iconName;
      },
      getIconUrl: function (socialCode, forcePNG) {
        return getImagePath(forcePNG) + this.getIconName(socialCode) + getImageType(forcePNG) + '?1';
      }
    };
  }])
;
;
/**
 * Author: ksankaran (Velu)
 * Date: 8/16/13
 * Time: 3:56 PM
 * Comments: dsxdate directive for helping template files process the date vars at ease.
 */

twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module("shared",[]);
twc.shared.apps.directive('dsxdate',['$rootScope', 'datefactory', function ($rootScope, datefactory) {
  var directoryDefinition = {
    priority: 0,
    replace: true,
    template: '<span class="wx-dsxdate" data-ng-bind="dsxDateOutput()"></span>',
    scope: true,
    restrict: 'EA',
    link: function($scope, $element, $attrs) {
      // Initialize
      $scope.dsxDateOutput = function() {
        prefix = $scope.$eval($attrs.labelprefix) || '';
        var data = {
          date: $scope.$eval($attrs.date),
          time: $scope.$eval($attrs.time),
          datetime: $scope.$eval($attrs.datetime),
          timezone:$scope.$eval($attrs.timezone),
          placeholder: $scope.$eval($attrs.placeholder),
          format:$scope.$eval($attrs.format)
        };

        if (data.datetime || data.date || data.time) {
          var dateObj;
          if (data.datetime) {
            dateObj = datefactory['new'](data.datetime, data.timezone);
          } else {
            dateObj = datefactory['new'](data.date, data.time, data.timezone);
          }

          if (dateObj) {
            var formattedDate = dateObj.format(data.format);
            if (formattedDate) {
              return prefix + ' ' + formattedDate;
            }
          }
        } else {
          return prefix + ' ' + angular.isDefined(data.placeholder) ? data.placeholder : datefactory['new']('', data.timezone).format(data.format);
        }
      };
    }
  };
  return directoryDefinition;
}]);;
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps
  .constant('statusCodes', {
    LOADING: "loading",
    NOT_AVAILABLE: "na",
    CUSTOM_ERROR: "custom",
    ERROR: "error",
    READY: "ready",
    DEFAULT: "default"
  })

  .constant('gmModuleStatusConfig', {
    MODULE_PATH: "/sites/all/modules/glomo/shared/glomo_module_status/"
  })

  .directive('gmModuleStatus', ['statusCodes', 'twcUtil', 'gmModuleStatusConfig',
    function(statusCodes, twcUtil, gmModuleStatusConfig) {
      var moduleStatusDefinition = {
        restrict: 'A',
        transclude: true,
        scope: {
          status: '=gmModuleStatus',
          gmModuleStatusTheme: '=',
          gmLoadingIndicator: '=',
          gmHideOnError: '='
        },
        templateUrl: gmModuleStatusConfig.MODULE_PATH + 'templates/glomo_module_status.html',
        controllerAs: 'gmModuleStatus',
        controller: ['$scope', '$element', '$transclude', function($scope, $element, $transclude) {

          this.loadingIndicator = function() {
            return !!$scope.gmLoadingIndicator;
          };

          this.isLoading = function() {
            return $scope.status === statusCodes.LOADING;
          };

          this.isStandardError = function() {
            return !twcUtil.contains([
                statusCodes.LOADING,
                statusCodes.DEFAULT,
                statusCodes.CUSTOM_ERROR,
                statusCodes.READY
              ],
              $scope.status);
          };

          this.isCustomError = function() {
            return $scope.status === statusCodes.CUSTOM_ERROR;
          };

          this.isReady = function() {
            return ($scope.status === statusCodes.DEFAULT) || ($scope.status === statusCodes.READY);
          };

          this.$transclude = $transclude;
        }],
        link: function(scope, element) {
          if (angular.isDefined(scope.gmHideOnError) && scope.gmHideOnError === true) {
            var unregister = scope.$watch('status', function() {
              if (scope.gmModuleStatus.isStandardError() || scope.gmModuleStatus.isLoading()) {
                element.parents('.panel-pane').hide();
              } else {
                element.parents('.panel-pane').show();
                unregister();
              }
            });
          }
        }
      };

      return moduleStatusDefinition;
    }
  ])
  // This mumbo jumbo handles nested transcludes if necessary
  .directive('gmNestedTransclude', function() {
    return {
      require: '^gmModuleStatus',
      link: function($scope, $element, $attrs, gmModuleStatusCtrl) {
        gmModuleStatusCtrl.$transclude(function(clone) {
          $element.empty();
          $element.append(clone);
        });
      }
    };
  })

  .directive('gmModuleError', ['statusCodes', 'gmModuleStatusConfig', 'pfTranslateFilter', '$sce',
    function(statusCodes, gmModuleStatusConfig, pfTranslateFilter, $sce) {
      var moduleErrorDefinition = {
        restrict: 'A',
        scope: {
          status: '=gmModuleError',
          gmModuleErrorTheme: '=',
        },
        templateUrl: gmModuleStatusConfig.MODULE_PATH + 'templates/glomo_module_error.html',
        controllerAs: 'gmModuleError',
        controller: ['$scope', '$element', function($scope, $element) {
          this.isNotAvailable = function() {
            return $scope.status === statusCodes.NOT_AVAILABLE;
          };

          this.isGeneric = function() {
            return $scope.status === statusCodes.ERROR;
          };

          this.isBrowserUnsupported = function() {
            return angular.element('html').hasClass('lt-ie9');
          };

          $scope.getErrorMsgForBrowserUnsupport = function() {
            var translatedText = pfTranslateFilter("Please <a href='http://browsehappy.com/'>upgrade your browser</a> to improve your experience.", {
              context: 'glomo_module_status'
            });
            return $sce.trustAsHtml(translatedText);
          };
        }],
        link: function(scope, element) {
          eqjs.refreshNodes();
          eqjs.query();
        }
      };

      return moduleErrorDefinition;

    }
  ])

  .directive('gmModuleLoading', ['gmModuleStatusConfig', function(gmModuleStatusConfig) {
    var moduleLoadingDefinition = {
      restrict: 'A',
      priority: 0,
      templateUrl: gmModuleStatusConfig.MODULE_PATH + 'templates/glomo_module_loading.html'
    };

    return moduleLoadingDefinition;
  }]);
;
(function(root) {
  angular.module('twc_dal')
    .factory('DailyForecastTurboModel', function() {
      return root.DailyForecastTurboModel;
    })
    .config(["$provide", function($provide) {
      $provide.decorator('DailyForecastTurboModel', ["$injector", "$delegate",
        function($injector, $delegate) {
            var $q = $injector.get('$q');
          var pcoUser = $injector.get('pcoUser');
            return $delegate.extend({
              /**
                * Get user object from pco
                * @returns {Object} Pco user Object
                */
                getUser: function() {
                  return pcoUser;
                },
                execute: function() {
                    return $q.when(this.constructor.__super__.execute.apply(this, arguments));
                }
            });
        }]);
    }]);
}(window.TWC));;
/**
 * Author: ksankaran (Velu)
 * Date: 7/8/14
 * Time: 3:02 PM
 * Comments:
 */

twc.shared.apps.factory('CmsBreakingNowModelClass',['RecordModel',function( RecordModel ) {
  return RecordModel.extend({
    recordType: 'CmsBreakingNowModelClass',

    getTitle: function() {
      return this._get('title');
    },

    getHeadLine: function() {
      return this._get('headline');
    },

    getLinkUrl: function() {
      return this._get('link_url');
    },

    getColor: function() {
      return this._get('color');
    },

    getShare: function() {
      return this._get('share');
    },

    getShareType: function() {
      return this.getShare().type;
    },

    getLocations: function() {
      return this.getShare().locations;
    },

    setResponse: function( response ) {
      this.data = response;
      this.header = "NA";
    }
  });
}]);;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 9/2/14
 * Time: 4:35 PM
 * To change this template use File | Settings | File Templates.
 */

(function (angular, twc) {
  twc.shared.apps
    .directive('videoSchema',['$compile', function videoSchema($compile){
      return {
        replace: true,
        restrict: 'EA',
        scope: true,
        templateUrl: '/sites/all/modules/glomo/shared/glomo_social_sharing_factory/templates/video_schema.html'
      };
    }])
    .directive('imageSchema',['$compile', function videoSchema($compile){
      return {
        replace: true,
        restrict: 'EA',
        scope: true,
        templateUrl: '/sites/all/modules/glomo/shared/glomo_social_sharing_factory/templates/image_schema.html'
      };
    }])
    .directive('glomoSocialBar', ['$rootScope', 'twcUtil', '$compile', '$parse', '$timeout', function glomoSocialBarDirective($rootScope, twcUtil, $compile, $parse, $timeout) {
      return {
        restrict: 'EA',
        templateUrl: function (element, attrs) {
          var templatePath = '/sites/all/modules/glomo/shared/glomo_social_sharing_factory/templates/';
          var device = $rootScope.isMobile ? 'mobile' : '';
          var template = attrs.template;
          var basicTemplate = (angular.element('html').hasClass('lt-ie9') || angular.element('html').hasClass('ie-9')) ? 'glomo_social_bar.html' : 'glomo_social_bar.html';
          basicTemplate = template ? template + '.html' : basicTemplate;
          return (attrs.template ? templatePath + attrs.template + '.html' : templatePath + device + basicTemplate) + "?v=1.0.113";
        },
        require: '^twcReferenceScope',
        scope: {
          providers: '=',
          theme: '='
        },
        controller: ['$scope', function ($scope) {
          this.doShare = function (media) {
            $scope.callback($scope.refCtrl.refScope(), {'media': media});
          };
          this.theme = function () {
            return $scope.theme;
          };
          $scope.toggleExpand = false;
          $scope.expand = function () {
            $scope.toggleExpand = !$scope.toggleExpand;
          };
        }],
        link: function (scope, element, attrs, refCtrl) {
          var $ul = element.find('ul');
          scope.refCtrl = refCtrl;
          scope.callback = $parse(attrs.callback);
          angular.forEach(scope.providers, function (provider, key) {
            $ul.append($compile('<div data-glomo-media data-provider="' + provider + '"></div>')(scope));
          });
        }
      };
    }])
    .directive('glomoMedia', ['twcConstant', '$filter', function glomoMedia(twcConstant, $filter) {
      return {
        restrict: 'EA',
        replace: true,
        templateUrl: '/sites/all/modules/glomo/shared/glomo_social_sharing_factory/templates/glomo_social_media.html',
        require: ['^glomoSocialBar'],
        scope: true,
        controller: ['$scope', function ($scope) {
          $scope.doShare = function () {
            $scope.ctrl.doShare($scope.provider);
          };
          $scope.getTheme = function () {
            return $scope.ctrl.theme();
          };
        }],
        link: function (scope, element, attrs, ctrls) {
          var span = element.find('span');
          scope.provider = attrs.provider ? attrs.provider : '';

          var translateMap = {
            facebook: 'Share on Facebook',
            twitter: 'Tweet',
            googleplus: 'Post to Google+',
            reddit: 'Post to Reddit',
            pinterest: 'Pin It',
            email: 'Email',
            qq: 'QIt',
            sina: 'Sina'
          };

          var translationID = translateMap[scope.provider];

          var pfTranslateFilter = $filter('pfTranslate');
          var translation = pfTranslateFilter(translationID, {
            context: 'glomo_social_sharing_factory'
          });

          scope.title = translation;
          scope.mediaClass = twcConstant.socialMedia[scope.provider].icon || "";
          scope.ctrl = ctrls[0];
        }
      };
    }]);
})(angular, twc);
;
/**
 * User: Cody Schneider
 * Created: 5/1/2014
 */

twc.shared.apps
  .factory('wxiconFactory', ['twcUtil', function (twcUtil) {
    var config = {

      basePath: '/sites/all/modules/custom/angularmods/app/shared/wxicon/',
      pngPath: 'png/',
      svgPath: 'svg/',
      svgzPath: 'svgz/',
      allowSVG: true,
      useSVGz: true
    };
    config.useSVG = config.allowSVG && Modernizr.svg;

    var iconCodeMap = {
      'tornado': ['0', '00'],
      'tropical-storm': ['1', '01', '2', '02'],
      'thunderstorm': ['3', '03', '4', '04'],
      'rain-snow': ['5', '05', '7', '07'],
      'rain-hail': ['6', '06', '10', '35'],
      'freezing-drizzle': ['8', '08'],
      'scattered-showers': ['9', '09', '11', '39'],
      'rain': ['12'],
      'flurries': ['13'],
      'snow': ['14', '16'],
      'blowing-snow': ['15', '25'],
      'hail': ['17', '18'],
      'fog': ['19', '20', '21', '22'],
      'wind': ['23', '24'],
      'cloudy': ['26'],
      'mostly-cloudy-night': ['27'],
      'mostly-cloudy': ['28'],
      'partly-cloudy-night': ['29'],
      'partly-cloudy': ['30'],
      'clear-night': ['31'],
      'sunny': ['32', '36'],
      'mostly-clear-night': ['33'],
      'mostly-sunny': ['34'],
      'isolated-thunderstorms': ['37'],
      'scattered-thunderstorms': ['38'],
      'heavy-rain': ['40'],
      'scattered-snow': ['41'],
      'heavy-snow': ['42', '43'],
      'na': ['-', '44', 'na'],
      'scattered-showers-night': ['45'],
      'scattered-snow-night': ['46'],
      'scattered-thunderstorms-night': ['47']
    };
    function getImageType(forcePNG) {
      return config.useSVG && !forcePNG ? (config.useSVGz ? '.svgz' : '.svg') : '.png';
    }
    function getImagePath(forcePNG, optimized) {
      var iconPath = config.useSVG && !forcePNG ? (config.useSVGz ? config.svgzPath : config.svgPath) : config.pngPath;
      return config.basePath + iconPath;
    }

    return {
      getIconName : function(skyCode, optimized) {
        var iconName;
        if (twcUtil.isNumeric(skyCode) && skyCode >= 0 && skyCode <= 47) {
          // configure records
          var keys = twcUtil.keys(iconCodeMap);
          twcUtil.each(keys, function (key) {
            if (twcUtil.indexOf(iconCodeMap[key], skyCode.toString()) !== -1) {
              iconName = key;
            }
          });
        } else {
          iconName = 'na';
        }

        optimized && (iconName += '-optimized');

        return iconName;
      },
      getIconUrl: function (skyCode, forcePNG, optimized) {
        return getImagePath(forcePNG) + this.getIconName(skyCode, (!forcePNG && optimized)) + getImageType(forcePNG) + '?1';
      }
    };
  }])
;
;
/*jshint -W054,-W083 */
/**
 * User: Travis Smith
 *
 * This is served as a shared services and directives for all social media sharing across site, we intend to make this as
 * generic as possible to support providers per requirement
 *
 * NOTE:  Line & Tencent Weibo don't seem to be supported by Gigya at the moment
 *
 *  "facebook": "Facebook",
 *  "twitter": "Twitter",
 *  "googleplus": "Google +",
 *  "reddit": "Reddit",
 *  "pinterest": "Pineterest",
 *  "email": "Email",
 *  "qq": "Qzone",
 *  "sina": "Sina Weibo",
 *  "line": "LINE",
 *  "tencent" : "Tencent Weibo"
 *
 * The following providers currently support this operation:
 *
 * Facebook, Twitter, Googleplus, Messenger, LinkedIn, Digg,
 * Del.icio.us, Google Bookmarks, My AOL, Baidu, StumbleUpon,
 * Orkut, Skyrock, Tencent QQ, Sina Weibo, Kaixin, Renren,
 * mixi, VZnet, FriendFeed, Reddit, Box.net, Tumblr, Plaxo,
 * Technorati, Faves, Newsvine, Fark, Mixx, Bit.ly, Hatena,
 * Mister Wong, Amazon, Gmail, NetLog, Evernote, AOL Mail,
 * Current TV, Yardbarker, BlinkList, Diigo, DropJack, Segnalo,
 * LinkaGoGo, Kaboodle, Skimbit, Formspring, V Kontakte, Pinterest,
 * Spiceworks, Viadeo, nk.pl, Xing, Tuenti, Odnoklassniki, Douban.
 *
 * Addtional supported providers maybe found here
 * http://developers.gigya.com/010_Developer_Guide/18_Plugins/032_Share/030_Adding_More_Destinations#150_More_Explicit_Destinations.3a
 *
 */

;(function (angular, twc, TWC, document) {
  'use strict';

  /**
   * @ngdoc service
   * @name shared.GlomoTwcSocialSharing
   * @description
   *  Social sharing factory for changing necessary meta tags and schema for proper sharing.
   */
  twc.shared.apps.factory('GlomoTwcSocialSharing', ['$rootScope', '$window', '$location', '$interpolate', '$q', '$compile', 'customEvent', 'TagBuilder', 'twcConstant', 'twcUtil', 'socialConstants', 'httpclient', 'TwcMicrodata', 'PageIdentifier', 'GlomoSocialAPI', 'GlomoSocialMetaTags', 'mimeTypes', 'DrupalSettings', 'dsxclient', //'providerRulesFactory', //'MediaAssetFactory', 'photosAssetService'
    function GlomoTwcSocialSharing($rootScope, $window, $location, $interpolate, $q, $compile, customEvent, TagBuilder, twcConstant, twcUtil, socialConstants, httpclient, TwcMicrodata, PageIdentifier, GlomoSocialAPI, GlomoSocialMetaTags, mimeTypes, DrupalSettings, dsxclient) {
      /** @namespace GlomoTwcSocialSharing */

      /**
       * Social Sharing Object.
       *
       * @alias GlomoTwcSocialSharing
       * @namespace
       */
      var social = {},
        /**
         * Current share object.
         *
         * @type {Share}
         */
        share = new Share(),

        /**
         * @alias Share.metaTags
         */
        metaTags = share.metaTags;

      /**
       * Share Class
       *
       * @constructor
       * @access private
       *
       * @param instanceId
       * @param asset
       * @returns {{asset: *, data: {}, instanceId: *, metaTags: MetaTags}}
       */
      function Share(instanceId, asset) {
        this.asset = asset;
        this.data = (asset && asset.data ? asset.data : {});
        this.instanceId = instanceId;
        this.assetId = asset && asset.getId ? asset.getId() : '';
        this.metaTags = new GlomoSocialMetaTags.MetaTags();
      }

      // Listen to ugc dialog close event
      customEvent.getEvent('close-ugc-modal-event').progress(function () {
        social.setShare(share.instanceId);
        social.setMetaTags();
      });

      // the factory
      angular.extend(social, {
        settingsData: {
          //AssetId that will be used to provide error message if provider rules are not met for certain asset type
          //currently only supporting video
          messageAssetId: {
            video: ""
          }
        },
        isLoggedIn: false,
        userName: '',
        status: '',
        user: '',
        userAuth: {},
        shareUrl: $location.absUrl(),
        apiLoaded: GlomoSocialAPI.apiLoaded,
        params: {},

        /**
         * Ensures that the URL has the `_escaped_fragment_` query param.
         *
         * @see twcUtil.normalizeUrl()
         * @param {string} [url] Current sharable URL, defaults to current canonical URL. Default: current URL.
         * @returns {string} URL with `_escaped_fragment_`.
         */
        getUrlFrag: function (url) {
          url = url || angular.element(document.querySelector('[rel="canonical"]')).attr('href') || $location.absUrl();
          return twcUtil.normalizeUrl(twcUtil.addEscapedFragment(url));
        },

        /**
         * Gets the URL for sharing.
         *
         * @see this.getUrlFrag()
         *
         * @param {string} [provider] Provider
         * @param {boolean} [frag] Optional. Whether to add _escaped_fragment_. Default: true.
         * @param {boolean} [params] Optional. Whether to add parameters. Default: true.
         * @returns {string} URL to be shared.
         */
        getUrl: function (provider, frag, params) {
          // Get the URL for the current page with protocol, current parameters and search/query string
          var url = $window.location.href ||
            $location.absUrl() ||
            angular.element(document.querySelector('[rel="canonical"]')).attr('href');

          frag = 'boolean' === typeof frag ? !!frag : true;
          params = 'boolean' === typeof params ? !!params : true;

          switch (provider) {
            case 'og':
            case 'twitter':
            case 'googleplus':
            case 'facebook':
              provider = 'og' === provider ? 'facebook' : provider;
              url = frag ? social.getUrlFrag(url) : twcUtil.normalizeUrl(url);
              break;
            default:
              url = twcUtil.normalizeUrl(url);
              break;
          }

          if (provider && params) {
            url += ((url.indexOf('?') !== -1) ? '&' : '?') + socialConstants.urlParams[provider];
          }

          return url;
        },

        /**
         * Standardizes the type for OpenGraph, defaults to 'website'.
         *
         * @param {string} [type] Type, defaults to node-type-{type} body class.
         * @returns {string} Default Open Graph type.
         */
        getType: function (type) {
          var pageId, content;

          if (!type) {
            content = TWC.pco.get('page').attributes.content;
            pageId = PageIdentifier.getPageId(content);
            switch (pageId) {
              case 'video-index':
              case 'video-collection':
              case 'video-watch-collection':
              case 'video-standalone':
                return 'video.other';
              default:
                return 'article';
              //case 'article-index':
              //case 'article-collection':
              //case 'article-watch':
              //  return 'article';
              //default:
              //  if ('ugc'===content) {
              //    return 'article';
              //  }
              //  return 'website';
            }
          }

          return type;
        },

        /**
         * Set the default Meta Tags.
         *
         * These tags should already be set in the cache and from Drupal, but just in case...
         * Namely, og:site_name, twitter:site, twitter:creator, fb:profile_id, fb:app_id,
         * and all the twitter:app tags for iphone, ipad, and googleplay.
         *
         * @see setMetaTags()
         * @see socialConstants
         *
         */
        setDefaultMetaTags: function () {
          var i, k;

          // The rest of these tags will only need to be set once regardless of on screen content.
          // Site name, eg. The Weather Channel and @weatherchannel
          metaTags.site = {
            og: new GlomoSocialMetaTags.OgMetaTag('site_name', socialConstants.site_name),
            twitter: new GlomoSocialMetaTags.TwitterMetaTag('site', socialConstants.twitterSite)
          };

          // Content creator for Twitter, e.g., @weatherchannel
          metaTags['twitter:creator'] = new GlomoSocialMetaTags.TwitterMetaTag('creator', socialConstants.twitterSite);
          metaTags['twitter:domain'] = new GlomoSocialMetaTags.TwitterMetaTag('domain', 'https://weather.com');

          // Facebook profile and app IDs
          metaTags.apps = {
            fb: {
              profile_id: new GlomoSocialMetaTags.FacebookMetaTag('profile_id', socialConstants.apps.facebook.profile_id),
              app_id: new GlomoSocialMetaTags.FacebookMetaTag('app_id', socialConstants.apps.facebook.app_id)
            },
            twitter: {},
            windows: {}
          };

          // Social App Tags
          for (k in socialConstants.apps) {
            // iTunes/iOS has ipad and iphone
            if ('itunes' === k) {
              for (i in socialConstants.apps.itunes) {
                if (socialConstants.apps.itunes.hasOwnProperty(i)) {
                  metaTags.apps.twitter[i] = new GlomoSocialMetaTags.AppTags(i, socialConstants.apps.itunes[i]);
                }
              }
            } else if ('windows' === k) {
              for (i in socialConstants.apps.windows) {
                if (socialConstants.apps.windows.hasOwnProperty(i)) {
                  if (twcUtil.isArray(socialConstants.apps.windows[i])) {
                    metaTags.apps.windows[i] = [];
                    twcUtil.each(socialConstants.apps.windows[i], function (value) {
                      metaTags.apps.windows[i].push(new GlomoSocialMetaTags.WindowsMetaTag(i, value));
                    });
                  } else {
                    metaTags.apps.windows[i] = new GlomoSocialMetaTags.WindowsMetaTag(i, socialConstants.apps.windows[i]);
                  }
                }
              }
            } else if (socialConstants.apps.hasOwnProperty(k)) {
              metaTags.apps.twitter[k] = new GlomoSocialMetaTags.AppTags(k, socialConstants.apps[k]);
            }
          }

          // Add links
          social.addLinks();

          // Set the meta tags
          social.setMetaTags();

        },

        /**
         * Determines whether an asset can be shared on different providers or viewports.
         *
         * @note: Future use.
         * @param {string} provider Provider string.
         * @returns {boolean} Whether the asset can be shared.
         */
        canIShareOn: function (provider) {
          var flags = share.asset.getFlags && share.asset.getFlags(),
            permissions = {
              'big-web': 'Big Web',
              facebook: 'Facebook',
              'google+': 'Google+',
              intranet: 'Intranet',
              'little-web': 'Little Web',
              'mobile-apps': 'Mobile App',
              'tv-app': 'TV App',
              twitter: 'Twitter',
              youtube: 'YouTube'
            };

          provider = 'googleplus' === provider ? 'google+' : provider;

          if (flags && permissions.hasOwnProperty(provider)) {
            return flags[permissions[provider]];
          } else if (flags && flags['big-web']) {
            return flags['big-web'];
          }

          return true;
        },

        /**
         * Set metaTags object per social sharing instance by fetching meta data from social media tags on page.
         *
         * OG Tags: type, description, image, title, url
         * Twitter Tags: card, description, image, title, and url
         *
         * NOTE:  Certain variables need to be a functions as the token replacement hasn't occurred when the assignment is made.
         *
         */
        setMetaTags: function () {
          var type, override, description, url, attr;

          // Set type & override
          if (share.asset) {
            type = this.getType(share.asset.getType());
          } else {
            type = social.getType();
          }

          // Build URL based on asset
          if (share.asset && share.asset.getUrl) {
            url = $window.location.protocol + '//' + $window.location.hostname + share.asset.getUrl() + $window.location.search;
            url = social.getUrlFrag(url);
          } else if (share.asset && share.asset.url) {
            url = share.asset.url;
          } else {
            url = social.getUrl('facebook', true, false) + $window.location.search;
          }

          override = {
            card: 'summary_large_image', // 'video.other' === type ? 'player' : 'summary_large_image';
            image: share.asset && share.asset.getVariant && share.asset.getVariant(12).replace('http://utst.imwx.com', 'https://s.w-x.co/ugc') ||
            twcUtil.normalizeUrl(socialConstants.logoImage),
            title: share.asset && share.asset.getTitle && share.asset.getTitle() || TWC.pageTitle,
            type: type || 'article',
            url: twcUtil.normalizeUrl(url)
          };
          override.image = twcUtil.normalizeUrl(override.image);

          /** DO TAGS **/
            // Set og:type, default to 'website'
          metaTags.addOg('type', override.type);

          // Set twitter:card, default to summary_large_image (photo, deprecated)
          // Overrides `summary`
          metaTags.addTwitter('card', 'summary_large_image');

          // Set og:description, twitter:description, itemprop=description.
          description = share.asset && share.asset.getDescription && share.asset.getDescription() || TWC.pageDescription;
          description = description.indexOf('DOCTYPE') > -1 ? description.replace(/<\/?[^>]+(>|$)/g, "").trim() : description;
          attr = TWC.pco.get('page').getAttributes();
          if (attr.currentLocation && attr.currentLocation.prsntNm && description) {
            description = description.replace('$(prsntnm)', attr.currentLocation.prsntNm);
          }
          override.description = $interpolate(description)($rootScope);
          metaTags.addOTG('description', override.description);

          // Set og:image, twitter:image, itemprop=image.
          metaTags.addOTG('image', override.image);

          metaTags['image_src'] = new TagBuilder.HeadTag('link', [{
            href: override.image,
            rel: 'image_src',
            type: mimeTypes.getType(override.image)
          }]);
          metaTags['thumbnailUrl'] = new GlomoSocialMetaTags.GooglePlusMetaTag('thumbnailUrl', override.image);
          metaTags['image'] = new GlomoSocialMetaTags.GooglePlusMetaTag('image', override.image);
          metaTags['primaryImageOfPage'] = new GlomoSocialMetaTags.GooglePlusMetaTag('primaryImageOfPage', override.image);

          // Set og:title, twitter:title, itemprop=title.
          override.title = $interpolate(override.title)($rootScope);
          metaTags.addOTG('title', override.title);

          // Set og:url, twitter:url.
          metaTags.addOT('url', override.url);

          //console.log('metaTags %o', metaTags);
        },

        addLinks: function () {
          metaTags.links = {
            publisher: new TagBuilder.HeadTag('link', [
              {
                name: 'rel',
                value: 'publisher',
                primary: true
              },
              {
                name: 'href',
                value: socialConstants.profiles.googleplus
              }
            ]),
            author: new TagBuilder.HeadTag('link', [
              {
                name: 'rel',
                value: 'author',
                primary: true
              },
              {
                name: 'href',
                value: socialConstants.profiles.googleplus
              }
            ])
          };
          metaTags.links.publisher.addToDOM();
          metaTags.links.author.addToDOM();
        },

        getPageContent: function () {
          var p = TWC.pco.get('page'), a = p.getAttributes();
          if ('other' === a.content && Drupal.settings.twc.contexts && Drupal.settings.twc.contexts.term) {
            return 'term';
          }
          return a.content;
        },

        /**
         * Gets the asset information from DSX.
         *
         * @description Gets the asset information from DSX. Currently supports articles and videos.
         * @todo Support UGC, slideshows, etc. better.
         * @returns {Deferred.promise}
         */
        getAsset: function () {
          var deferred = $q.defer(),
            singleAssetDsxConfig = [],
            pageAttributes = TWC.pco.get('page').getAttributes(),
            assetId,
            recordName,
            dSettings;

          switch (social.getPageContent()) {
            // @todo Fetch map information, fetch storm information, etc.
            case 'video':
              recordName = 'video'; // 'videoAssetWithColl';
              assetId = TWC.PcoUtils.getter(DrupalSettings.getContexts(), 'node.uuid');
              break;
            //case 'ugc':
            //  recordName = 'ugcAssetWithColl';
            //  var photosFactory = $injector.get('photosFactory');
            //  assetId = photos.getPhotosAssetIdFromUrl();
            //  var assetData = mediaAssetFactory.getMediaAssetData({id: "assetData", assetId: assetId});
            //  break;
            case 'other':
            case 'article':
              // @todo Possibly change to xweb.photos from cms.aImg??
              recordName = 'aImg';
              dSettings = DrupalSettings.getContexts();
              assetId = dSettings && TWC.PcoUtils.getter(dSettings, 'node.uuid');
              if (!assetId) {
                deferred.resolve(null);
              }
              break;
            default:
              deferred.resolve(null);
              break;
          }

          singleAssetDsxConfig.push({
            $id: 'singleAssetData',
            assetId: assetId,
            recordType: 'cms',
            recordName: recordName
          });

          dsxclient.execute(singleAssetDsxConfig)
            .then(['singleAssetData',
              function (singleAssetData) {
                // Gracefully fail if no data returned
                if (!singleAssetData) {
                  //$scope.status = status.ERROR;
                  //deferred.reject(new Error('No results', status.ERROR));
                  return false;
                }

                // Merge collection with asset, item index is 0 since this will be the first item in the playlist
                singleAssetData.data = angular.extend({
                  "itemIndex": 0
                }, singleAssetData.data);

                deferred.resolve(singleAssetData);
              }
            ], function () {
              // catch
              //$scope.status = status.ERROR; /// new Error('something happened');
              deferred.reject(new Error('No results', status.ERROR));
            });

          return deferred.promise;
        },

        /**
         * Gets share instance
         * @param {string} instanceId
         * @param {object} asset Page/Asset data.
         * @returns {object} Share Object.
         */
        setShare: function (instanceId, asset) {
          //if (instanceId && asset) {
          //if (instanceId !== share.instanceId && asset && asset.getId && share.assetId !== asset.getId()) {
          //share = new Share(instanceId, asset);
          //}
          share = new Share(instanceId, asset);
          metaTags = share.metaTags;

          return share;
        },

        /**
         * Gets the current share object.
         *
         * @returns {Share}
         */
        getShare: function () {
          return share;
        },

        /**
         * Initialise social sharing settings (metaTags, share urls & load Gigya script)
         * @param instanceId
         * @param settingsData
         * @returns {Promise}
         */
        initSocialSettings: function (instanceId, settingsData) {
          //console.log('instanceId: %o', instanceId);
          //console.log('settingsData: %o', settingsData);
          social.settingsData.messageAssetId.video = settingsData.videoMessageAssetId;
          social.setShare(instanceId, settingsData._asset);

          return (
            $q.all(
              social.setDefaultMetaTags(),
              GlomoSocialAPI.loadAPI()
            )
          );
        }
      }, share);

      return social;
    }
  ]);
})(angular, twc, TWC, document);
;
/**
 * Created with JetBrains PhpStorm.
 * User: jefflu
 * Date: 9/4/14
 * Time: 9:12 AM
 * To change this template use File | Settings | File Templates.
 */

(function(TWC, angular, twc, document) {
  twc.shared.apps.controller('glomoSocialSharingController', ['$scope', '$location', '$window', '$q', '$injector', '$compile', '$document', 'settings', 'DrupalSettings', 'dsxclient', 'GlomoTwcSocialSharing', 'GlomoSocialAPI', 'customEvent', 'twcConfig', 'twcConstant', 'twcPco', 'twcUtil', 'socialConstants', 'bitly',
    function ($scope, $location, $window, $q, $injector, $compile, $document, settings, DrupalSettings, dsxclient, GlomoTwcSocialSharing, GlomoSocialAPI, customEvent, twcConfig, twcConstant, twcPco, twcUtil, socialConstants, bitly) {
      'use strict';

      var status = twcConfig.module_status_codes;
      var params, share, currentInstanceId;

      /** private functions */
      var fns = {
        createProviderArray: function (settings) {
          angular.forEach(settings.providers, function (value) {
            if (value) {
              $scope.params.providers.push(value);
            }
          });
        },
        getAsset: GlomoTwcSocialSharing.getAsset
      };

      $scope.params = {
        instanceId: null,
        providers: [],
        scope: $scope,
        settings: null,
        status: status.LOADING
      };
      $scope.sData = {};
      $scope.asset = {};

      $scope.getPageContent = GlomoTwcSocialSharing.getPageContent;

      /**
       * Initialize the controller.
       *
       * Creates the providers allowed array.
       * After ensuring that the page and user promises complete,
       * instantiates the social settings.
       *
       * @see DrupalSettings.getInstanceIdBySettings
       * @see GlomoTwcSocialSharing.initSocialSettings()
       * @see GlomoTwcSocialSharing.getShareInstance()
       */
      $scope.initSocial = function () {

        /**
         * Settings Object
         * {
         *  disable_layload: {boolean|number}
         *  module_id: social_sharing // @todo change to glomo_social_sharing?
         *  module_version: {string}
         *  providers: {object}
         *    email: {string}, facebook: {string}, googleplus: {string},
         *    qq: {string}, reddit: {string}, sina: {string}, twitter: {string}
         *  videoMessageAssetId:{string}
         * }
         */
        $scope.params.settings = settings;

        // String
        currentInstanceId = $scope.params.instanceId = DrupalSettings.getInstanceIdBySettings(settings);

        // @todo Determine ID issue? $scope.params.instanceId is different from the first newAsset payload data instanceId
        fns.createProviderArray(settings);

        // Make sure page & user promises are completed.
        //@todo intercept
        $q.all(twcPco.get('page').promises.concat(twcPco.get('user').promises))
          .then(function () {

            fns.getAsset()
              .then(function(asset) {
                TWC.PcoUtils.schema.addItemType(document.querySelector('html'), 'http://schema.org/Article');

                $scope.asset = settings._asset = asset;
                $scope.setAsset(asset);

                // Initilize social settings
                GlomoTwcSocialSharing.initSocialSettings($scope.params.instanceId, settings)
                  .then(function () {
                    // Set $scope Controller vars
                    params = $scope.params;

                    // Get the share instance & setup shortcut vars
                    share = GlomoTwcSocialSharing.setShare(params.instanceId, asset);
                  });
              });

          });

        // Add event listeners
        // Subscribe to asset change event
        customEvent.getEvent('newAsset')
          .progress(function (payload, instanceId) {
            var attr = TWC.pco.get('page').getAttributes();
            // If an article page with a video asset, do nothing
            if ('article' === attr.content && 'videoplayer-present' === attr.contains_videoplayer) {
              if(payload.getType && 'article' !== payload.getType()) {
                return;
              }
            }

            currentInstanceId = instanceId || payload.getId && payload.getId() || $scope.params.instanceId;

            $scope.asset = payload;
            $scope.setAsset(payload);

            if (payload.getSEOUrl && payload.getSEOUrl() && payload.getUrl && !payload.getUrl()) {
              payload.data.url = payload.getSEOUrl();
            }

            GlomoTwcSocialSharing.setShare(currentInstanceId, payload);
            GlomoTwcSocialSharing.setMetaTags();
          });

        //Subscribe to imap layer change event
        customEvent.getEvent('imap_layerChanged')
          .progress(function (layer) {
            var currentURL = $location.absUrl();
            var queryStringChar = ((currentURL.indexOf('?') !== -1) ? '&' : '?');
            var layersParam = TWC.PcoUtils.getURLParameter("interactiveMapLayer");
            var posOfLayersParam = currentURL.indexOf("interactiveMapLayer");
            if (posOfLayersParam !== -1) {
              currentURL = currentURL.replace("interactiveMapLayer=" + layersParam, "interactiveMapLayer=" + layer);
            }
            else {
              currentURL += queryStringChar + "interactiveMapLayer=" + layer;
            }
            GlomoTwcSocialSharing.setShare($scope.params.instanceId, {url: currentURL});
            GlomoTwcSocialSharing.setMetaTags();
            //GlomoTwcSocialSharing.updateMapLayerShare($scope.params.instanceId, currentURL);
          });

        // Subscribe to alert detail event
        customEvent.getEvent('alertDetailEvent')
          .progress(function (payload) {
            $scope.asset = payload;
            GlomoTwcSocialSharing.setShare($scope.params.instanceId, payload);
            GlomoTwcSocialSharing.setMetaTags();
            //GlomoTwcSocialSharing.alertInfoUpdate($scope.params.instanceId, payload);
          });

        //Subscribe to article index page pagination event
        customEvent.getEvent('urlChangeEvent')
          .progress(function () {
            // update og:url

          });
      };

      $scope.setAsset = function(asset) {
        var $elem, schema, image, height, width;

        if (asset && asset.getType && 'video' === asset.getType()) {
          var duration = asset.getDuration();
          $elem = angular.element('.videoWrapper');

          TWC.PcoUtils.schema.addItemType(document.querySelector('#wx-hero-content'), 'http://schema.org/Article');
          $scope.sData = {
            videoData: asset
          };

          //$document.getElementsByClassName('.videoWrapper');
          if ($elem) {
            // Remove existing VideoObject schema
            schema = angular.element('.videoWrapper').find('.video-schema');
            if (schema.length === 0) {
              TWC.PcoUtils.schema.addItemType(document.querySelector('.videoWrapper'), 'http://schema.org/VideoObject');
              $elem.append($compile(document.createElement('video-schema'))($scope)[0]);
            }
            if (image = asset.getVariant(16)) {
              width = 1280;
              height = 720;
            } else if (image = asset.getVariant(12)) {
              width = 980;
              height = 551;
            }
            angular.extend($scope.sData, {
              href: $window.location.href,
              duration: (function(time) {
                var format = 'PT%sH%sM%sS';
                for( var i=1; i < time.length; i++ ) {
                  format = format.replace( /%s/, time[i] );
                }
                return format;
              })(duration.split(':')),
              image: {
                url: image,
                width: width,
                height: height
              },
              embedUrl: socialConstants.securePath + '/video/player/' + asset.getId(), //asset.getVariant('video') || asset.data.mezzanine_url,
              id: asset.getId(),
              title: asset.getTitle(),
              description: asset.getVideoDescription && asset.getVideoDescription() || asset.getDescription && asset.getDescription(),
              datePublished: asset.data.lastmodifieddate || asset.getPublishDate()
            });
          }
        } else if (asset && asset.getType && ('article' === asset.getType() || 'image' === asset.getType())) {
          $elem = angular.element('main');

          TWC.PcoUtils.schema.addItemType(document.querySelector('#wx-main'), 'http://schema.org/Article');
          $scope.sData = {
            imageData: asset
          };

          if ($elem) {
            // Remove existing VideoObject schema
            schema = angular.element('#wx-main').find('.image-schema');
            if (schema.length === 0) {
              $elem.prepend($compile(document.createElement('image-schema'))($scope)[0]);
            }
            if (image = asset.getVariant(16)) {
              width = 1280;
              height = 720;
            } else if (image = asset.getVariant(12)) {
              width = 980;
              height = 551;
            }
            angular.extend($scope.sData, {
              href: $window.location.href,
              image: {
                url: image,
                width: width,
                height: height
              },
              id: asset.getId(),
              title: asset.getTitle(),
              description: asset.getVideoDescription && asset.getVideoDescription() || asset.getDescription(),
              datePublished: asset.data.lastmodifieddate || asset.getPublishDate()
            });
          }
        }
      };

      /**
       * Helper function to get a specific meta tag's content value.
       *
       * First checks if the value exists in metaTags. If it doesn't, it grabs
       * the value from the DOM, first trying meta[name=propertyType] and falling
       * back to check meta[property=propertyType] and finally falling back to
       * meta[itemprop=propertyType]
       *
       * @param {string} propertyType Name/Property.
       * @returns {string} Value of content attribute.
       */
      $scope.getMetaContent = function (propertyType) {
        var content,
          properties = ['name', 'property', 'itemprop'],

            /**
             * Helper function to get content value of a specific attribute.
             * @param {string} attr Attribute to check.
             * @returns {string|boolean} Content value or false.
             */
          getAttribute = function(attr) {
            content = document.querySelector('[' + attr + '="' + propertyType + '"]');
            if (content) {
              return content.getAttribute('content');
            }

            return false;
          };

        share = GlomoTwcSocialSharing.getShare();
        if (share.metaTags && share.metaTags[propertyType]) {
          return share.metaTags[propertyType].getContent();
        }

        for(var i = 0, l = properties.length; i < l; i++) {
          if (content = getAttribute(properties[i])) {
            return content;
          }
        }

        return '';
      };

      $scope.openShare = function(provider) {
        $q.when(GlomoSocialAPI.loadAPI())
          .then(function() {
            $scope.doOpenShare(provider);
          });
      };

      /**
       * Prepare share data info to pop open social media share dialog
       * Originally we want to load Gigya script on demand (when user click on share button on the first time) but that requires to wait for promise
       * to be resolved thus the browser thinks gigya.socialize.postBookmark call is being triggered by an event thus blocks the popup
       * loadAPI has been moved to initSocialSettings
       * NOTE:  Browsers blocks popups if action is not user initiated
       * @param provider
       * @returns {boolean}
       */
      $scope.doOpenShare = function (provider) {
        var title,
          thumbnailUrl,
          videoUrl,
          description = 'twitter' !== provider ? this.getMetaContent('og:description') : this.getMetaContent('twitter:description'),
          url = this.getMetaContent('og:url'),
          userAction = new gigya.socialize.UserAction();

        switch (provider) {
          case 'twitter':
            title = this.getMetaContent('twitter:title') || this.getMetaContent('twitter:description');
            title += ' @weatherchannel';
            thumbnailUrl = this.getMetaContent('twitter:image') || this.getMetaContent('og:image');
            videoUrl = this.getMetaContent('twitter:player') || this.getMetaContent('og:video:url');
            break;

          default:
            title = this.getMetaContent('og:title');
            thumbnailUrl = this.getMetaContent('og:image');
            videoUrl = this.getMetaContent('twitter:player');
            break;
        }

        if (!title) {
          title = angular.element('title').text();
        }

        // Fix thumbnail for UGC
        // @todo This needs attention. Example DSX: https://dsx-stage.weather.com/cms/v4/asset-collection/en_US/(58557493-669c-4476-86d9-a0ee513bae04--db04bc18-ee64-11e2-9ee2-001d092f5a10)?api=7bb1c920-7027-4289-9c96-ae5e263980bc&jsonp=angular.callbacks._d
        if ('ugc' === TWC.pco.get('page').attributes.content) {
          thumbnailUrl = thumbnailUrl.replace('http://utst.imwx.com', 'https://s.w-x.co/ugc');
        }


        if ('term' === $scope.getPageContent()) {
          if (Drupal.settings.twc.contexts.term.field_meta_og_image.und[0].value) {
            thumbnailUrl = Drupal.settings.twc.contexts.term.field_meta_og_image.und[0].value;
          }
        }
        thumbnailUrl = twcUtil.normalizeUrl(thumbnailUrl);
        videoUrl = twcUtil.normalizeUrl(videoUrl);

        // Setting the Title & Subtitle
        userAction.setTitle(title);
        userAction.setSubtitle($location.host());

        // Setting the Link Back
        if (provider) {
          url += ((url.indexOf('?') !== -1) ? '&' : '?') + socialConstants.urlParams[provider];
        }

        // Normalize
        url = twcUtil.normalizeUrl(twcUtil.removeEscapedFragment(url));

        // Set link and action links
        userAction.setLinkBack(url);
        userAction.addActionLink('Get Weather App', 'https://weather.com/apps');
        userAction.addActionLink('Connect with Weather.com', 'https://weather.com/social');

        // Setting the Description
        if (description) {
          userAction.setDescription(description);
        }

        // Set Media Item (Video/Image)
        userAction.addMediaItem({
          type: 'image',
          src: thumbnailUrl,
          href: url
        });

        // @todo Get other images to add (e.g., slideshow, ugc)
        //if (twcUtil.isArray(TWC.pco.get('page').getAttributes().modules.wxnode_slideshow) && TWC.pco.get('page').getAttributes().modules.wxnode_slideshow.length > 0) {
        //}

        if ($scope.getMetaContent('og:type') === "video.other" && (provider === 'facebook' || provider === 'twitter')) {
          userAction.addMediaItem({
            previewImageURL: thumbnailUrl,
            previewImageWidth: '160',
            previewImageHeight: '90',
            src: videoUrl,
            type: 'flash',
            width: '485',
            height: '273'
          });
        }

        customEvent.getEvent('socialApiLoaded').then(function() {
          if (GlomoSocialAPI.isAPIloaded()) {
            var options = {
              provider: provider,
              url: url,
              title: title,
              description: description,
              thumbnailURL: thumbnailUrl,
              shortURLs: 'never', //('twitter' === provider) ? 'always' : 'never',
              cid: twcPco.getNodeValue('metrics', 'contentChannel') || '',
              onError: function(e) {
                console.log('Error: %o', arguments);
              },
              userAction: userAction
            };
            /*
              Custom event to override page share. Currently only used by today page
             */
            customEvent.getEvent('shareElement').progress(function(shareObj){
              options.title = shareObj.title || options.title;
              options.description = shareObj.description || options.description;
              options.thumbnailURL = shareObj.thumbnailURL || options.thumbnailURL;
              options.userAction.mediaItems = shareObj.mediaItem || options.userAction.mediaItems;
            });


            if ('email' === provider) {

              var getTemplate = function() {
                var template = 'I saw this on The Weather Channel and thought you might want to see it.\n\n',
                  titleTemplate = '%%TITLE%%\n',
                  descriptionTemplate = '%%DESCRIPTION%%\n\n',
                  footerTemplate = 'See the article here: %%URL%%\n\n' +
                    'Download The Weather Channel app: https://weather.com/apps\n' +
                    'Follow The Weather Channel: https://weather.com/social';

                template += title ? titleTemplate.replace('%%TITLE%%', title) : '';
                template += description ? descriptionTemplate.replace('%%DESCRIPTION%%', description) : '';
                template += footerTemplate.replace('%%URL%%', url);

                return template;
              };

              var openEmail = function() {
                $window.location = 'mailto:?body=' + encodeURIComponent(getTemplate()) + '&subject=' + (encodeURIComponent(title) || 'Check this out on the Weather Channel');
              };

              openEmail();

            } else {

              if ('facebook' === provider) {
                //options.facebookDialogType = 'share';
                options.facebookDialogType = 'feed';
              }

              //console.log('gigya.socialize.postBookmark options %o', options);
              gigya.socialize.postBookmark(options);
            }

            $scope.trackProvider(provider);
          } else {
            return false;
          }
        });

      };

      /**
       * Track provider event in Omniture
       *
       * @see socialContants
       * @param {string} provider Social Sharing provider.
       */
      $scope.trackProvider = function (provider) {

        var attrs = {
          linkTrackVars: 'eVar21,eVar22,eVar24,campaign,events',
          linkTrackEvents: socialConstants.omnitureEvents[provider],
          socialTrackAction: true,
          eVar21: provider,
          eVar22: twcPco.getNodeValue('metrics', 'pagename') || '',
          eVar24: twcPco.getNodeValue('metrics', 'contentChannel') || '',
          campaign: null,
          events: socialConstants.omnitureEvents[provider]
        };

        customEvent.getEvent('track-string-event').notify({
          trackStr: twcConstant.socialMedia[provider].title,
          settings: $scope.params.settings || {},
          attrs: attrs
        });
      };

    }]);
})(TWC, angular, twc, document);
;
/**
 * Author: Cody Schneider
 * Comments: Directive for rendering SVG weather icons with PNG fallback for IE8
 *
 * TODO: move images to cloud
 *
 * Usage:
 * <div wxicon sky-code="forecast.getSkyCode()"></div>
 * 
 */

twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module("shared",[]);
twc.shared.apps.directive('wxicon',['twcUtil', 'wxiconFactory', function (twcUtil, wxiconFactory) {

  var wxIconDefinition = {
    priority    : 0,
    replace     : false,
    template : function (element, attributes) {
      var markup = '<div class="svg-icon">'; 

      if((navigator.appVersion.indexOf('Trident') === -1) && (attributes.imageType!=='raster')) {
        if(attributes.vectorOptimized) { // newest, most efficient version of wxicons that can be controlled by CSS
          markup += '<ng-include src="getIconUrl(\'vector\', true)" />';
        }
        else { // legacy SVG, bloated wxicons
          markup += '<img ng-src="{{getIconUrl(\'vector\')}}" />';
        }
      }
      else { // raster version for IE11 etc
        markup += '<img ng-src="{{getIconUrl(\'raster\')}}" />';
      }

      markup += '</div>';

      return markup;
    },
    scope       : {
      skyCode: '='
    },
    restrict    : 'EA',
    link  : function($scope, $element) {
      // Add class to element.
      $element.addClass("wx-weather-icon");
      
      $scope.$watch('skyCode', function(code) {
        $element.attr('aria-hidden', 'true');
        $element.attr('alt', wxiconFactory.getIconName($scope.skyCode).replace('-', ' '));
      });

      $scope.getIconUrl = function (type, optimized) {
        return wxiconFactory.getIconUrl($scope.skyCode, (type==='raster'), optimized);
      };
    }
  };

  return wxIconDefinition;
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 2/4/14
 * Time: 1:27 PM
 * Comments:
 */

twc.shared.apps.factory('CmsCollectionsModelClass', ['RecordModel',
    function(RecordModel) {
        return RecordModel.extend({
            recordType: 'CmsCollections',

            /**
             * The response is simple and without header. So, set the response as data.
             * @param response
             */
            setResponse: function(response) {
                this.data = response;
                this.header = "NA";
            },

            /**
             * getGroupId
             * @returns {String}
             */
            getGroupId: function() {
                return this._get('groupid');
            },

            /**
             * Collection ID
             * @return {String}
             */
            getId: function() {
                return this._get('id');
            },

            /**
             * Get asset id
             *
             * @returns {String}
             */
            getDescription: function() {
                return this._get('description');
            },
            /**
             * getTitle
             * @returns {String}
             */
            getTitle: function() {
                return this._get('title');
            },
            /**
             * theme
             * @returns {String}
             */
            getTheme: function() {
                return this._get('theme');
            },
            /**
             * sponsorship
             * @returns {String}
             */
            getSponsorship: function() {
                return this._get('sponsorship');
            },
            /**
             * sequence
             * @returns {String}
             */
            getSequence: function() {
                return this._get('sequence');
            },
            /**
             * featured
             * @returns {String}
             */
            getFeatured: function() {
                return this._get('featured');
            },
            /**
             * imageurl
             * @returns {String}
             */
            getImageUrl: function() {
                return this._get('imageurl');
            },

            /**
             * Get collection data background image - video
             *
             * @returns {String}
             */
            getVideoBackgroundImage: function() {
                return this._get('background_image') ? this._get('background_image').video : null;
            },

            /**
             * Get collection data background image - article
             *
             * @returns {String}
             */
            getArticleBackgroundImage: function() {
                return this._get('background_image') ? this._get('background_image').article : null;
            },

            /**
             * Get collection data background image - article
             *
             * @returns {String}
             */
            getTitleImage: function() {
                return this._get('background_image') ? this._get('background_image').title : null;
            },

            /**
             * imageurl
             * @returns {String}
             */
            getUrl: function() {
                return this._get('url');
            },

            /**
             * Get collection data background image - article
             *
             * @returns {String}
             */
            getSponsored: function() {
                return this._get('sponsored');
            },

            /**
             *  Returns ads metrics object
             */
            getAdMetrics: function() {
              return this._get('ad_metrics');
            }

        });
    }
]);
;
(function(root) {
  angular.module('twc_dal')
    .factory('TwcDalBaseModel', function() {
      return root.TwcDalBaseModel;
    });
}(window.TWC));;
(function (root) {
  angular.module('twc_dal').factory('TwcDalModel', function() {
    return root.TwcDalModel;
  });
}(window.TWC));;
// register module with angular for post-bootstrap operations.
(function (root) {
  angular.module('twc_dal').factory('TwcDalCache', function() {
     return root.TwcDalCache;
  });
}(window.TWC));;
(function (root) {
  angular.module('twc_dal').factory('TwcDalClient', function() {
    return root.TwcDalClient;
  });
}(window.TWC));;
(function (root) {
  angular.module('twc_dal').factory('SunTurboAggregationConfig', function() {
    return root.SunTurboAggregationConfig;
  });
}(window.TWC));;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 12/5/13
 * Time: 4:54 PM
 *
 */
twc.shared.apps
  .factory('WxdPollenModelClass',['RecordModel', 'twcUtil', 'WxdPollenRecordModelClass',function(RecordModel, twcUtil, WxdPollenRecordModelClass) {
    return RecordModel.extend({
      recordType: 'Pollen',
      construct: function() {
        this.pollenAlerts = {
          tree:[],
          grass:[],
          weed:[],
          mold: 0
        };
        RecordModel.prototype.construct.apply(this,arguments);
      },

      setResponse: function(response) {
        this._mapPollenRecords(response, 'tree', this.pollenAlerts);
        this._mapPollenRecords(response, 'grass', this.pollenAlerts);
        this._mapPollenRecords(response, 'weed', this.pollenAlerts);
        this._mapPollenRecords(response, 'mold', this.pollenAlerts);
      },

      _mapPollenRecords: function(response, type, pollenAlerts) {
        if( twcUtil.isObject(response[type]) || twcUtil.isArray(response[type]) ) {
          twcUtil.each(response[type], function(pollenRecord) {
            pollenRecord.type = type;
            pollenAlerts[type].push(new WxdPollenRecordModelClass(pollenRecord));
          });
        }
        else if ( twcUtil.isString(response[type]) || twcUtil.isNumber(response[type]) ){
          pollenAlerts[type] = new WxdPollenRecordModelClass(response[type]);
        }
      },
      getPollenRecords: function(type) {
        return typeof type === 'string' ? this.pollenAlerts[type.toLowerCase()] : undefined;
      }
    });
  }])
  .factory('WxdPollenRecordModelClass',['RecordModel', function(RecordModel) {
    return RecordModel.extend({
      setResponse: function(response) {
        this.data = response;
      },

      getType: function() {
        return this._get('type');
      },

      getSeverity: function() {
        return this._get('idxPrt1');
      },

      getSeverityDescription: function() {
        return this._get('idxPhr1');
      },

      getLocalTime: function() {
        return this._get('idxLocTm');
      },

      getGMTTime: function() {
        return this._get('idxGMTTm');
      },

      getSpecies: function() {
        return this._get('idxAux2');
      }
    });
  }]);;
/**
 * Created with JetBrains PhpStorm.
 * User: thomas.vo
 * Date: 12/5/13
 * Time: 12:48 PM
 * Bulletin/Alert
 */
twc.shared.apps.factory('WxdBERecordModelClass',['RecordModel', 'twcUtil', function(RecordModel, twcUtil) {
  return RecordModel.extend({
    recordType: 'BERecord',

    construct: function() {
      this._langToNarrTextCache = {};
      RecordModel.prototype.construct.apply(this,arguments);
    },

    setResponse: function(response) {
      this.header   = response.BEHdr;
      this.data     = response.BEData;
      this.event    = response.BEHdr&&response.BEHdr.bEvent||{};
      this.location = response.BEHdr&&response.BEHdr.bLocations||{};
    },

    getLocationCounty: function() {
      return this.location.bLocCd__bLoc;
    },

    getLocationStateCd: function() {
      return this.location.bStCd;
    },

    getLocationState: function() {
      return this.location.bStCd_bSt;
    },

    getLocationType: function() {
      return this.location.bLocCd__bLocTyp;
    },

    getLocationCd: function() {
      return this.location.bLocCd;
    },

    getLocationStateName: function(){
      return this.location.bStCd__bSt;
    },

    getLocationUTCOffset: function() {
      return this.location.bUTCDiff;
    },

    getLocationTimeZone: function() {
      return this.location.bTzAbbrv;
    },

    getEventSeverity: function() {
      return this.event.eSvrty;
    },

    getEventSignificance: function() {
      return this.event.eSgnfcnc;
    },

    getEventDescription: function() {
      return this.event.eDesc;
    },
      getEventDescriptionSuffix: function() {
          return this.header._multiPostfix;
      },

    getEventTrackingNumber: function() {
      return this.event.eETN;
    },

    getEventActionPriority: function() {
      return this.event.eActionCd__eActionPriority;
    },

    getEventActionCode: function() {
      return this.event.eActionCd;
    },

    getEventPhenomena: function() {
      return this.event.ePhenom;
    },

    getEventStartTimeInUTC: function() {
      return this.event.eStTmUTC;
    },

    getEventEndTimeInUTC: function() {
      return this.event.eEndTmUTC;
    },

    getEventStartLocalTime: function () {
      return this.event._eStTmLocal;
    },

    getEventEndLocalTime: function () {
      return this.event._eEndTmLocal;
    },

    getEventOfficeId: function() {
      return this.event.eOfficeId;
    },

    getTwcIId: function() {
      return this.event.eTWCIId;
    },

    getEventOfficeName: function() {
      return this.event.eOfficeId__eOfficeNm;
    },

    getFloodCode: function() {
      return this.event.eFld && this.event.eFld.eFldRcrdCd;
    },

    getFloodRecordDescription: function() {
      return this.event.eFld && this.event.eFld.eFldRcrdCd__eFldRcrd;
    },

    getFloodSeverityCode: function() {
      return this.event.eFld && this.event.eFld.eFldSvrtyCd;
    },

    getFloodSeverityDescription: function() {
      return this.event.eFld && this.event.eFld.eFldSvrtyCd__eFldSvrty;
    },

    getFloodCauseCode: function() {
      return this.event.eFld && this.event.eFld.eFldCauseCd;
    },

    getFloodCauseDescription: function() {
      return this.event.eFld && this.event.eFld.eFldCauseCd__eFldCause;
    },

    getFloodRiverName : function() {
      return this.event.eFld && this.event.eFld.eNWSLICd__eNWSLI;
    },
      getFloodEventDescriptionSuffix: function() {
          return this.event.eFld && this.event.eFld._eFldSeq;
      },

    getHeadlineText: function() {
      var headline = this._get('bHdln');
      /**
       * The way that we retrieve bHdlnTxt may seem weird, but it's there for a reason. Ask dsx team for more details.
       */
      return headline && headline[0] && headline[0].bHdlnTxt;
    },

    getNarrativeLangList: function() {
      return this._get('bNarrTxt__bNarrTxtLang');
    },

    getIssueTimeInUTC: function() {
      return this._get('bIssueTmUTC');
    },

    getIssueTimeLocalISO: function() {
      return this._get('bIssueTmISOLocal');
    },

    getProcessTime: function() {
      return this.header._procTmLocal;
    }, 

    /**
     * Get Narrative text by language
     * @param [lang] default to english
     * @returns {*}
     */
    getNarrativeTextByLanguage: function(lang) {
      lang = lang || 'en-GB';

      var narrTxt = this._langToNarrTextCache[lang];
      if(this._langToNarrTextCache[lang] === undefined) {
        narrTxt = twcUtil.find(this._get('bNarrTxt') || [], function(narrTxt) {
          return narrTxt;
        });
        narrTxt = narrTxt || null;
        this._langToNarrTextCache[lang] = narrTxt;
      }

      return narrTxt && narrTxt.bLn;
    }
  });
}]);;
(function(root) {
  angular.module('twc_dal')
    .factory('PollenObsTurboModel', function() {
      return root.PollenObsTurboModel;
    })
      .config(["$provide", function($provide) {
          $provide.decorator('PollenObsTurboModel', ["$injector", "$delegate",
              function($injector, $delegate) {
                  var $q = $injector.get('$q');
                  return $delegate.extend({
                      execute: function() {
                          return $q.when(this.constructor.__super__.execute.apply(this, arguments));
                      }
                  });
              }]);
      }]);
}(window.TWC));;
(function(root) {
  angular.module('twc_dal')
    .factory('ObservationTurboModel', function() {
      return root.ObservationTurboModel;
    })
    .config(["$provide", function($provide) {
      $provide.decorator('ObservationTurboModel', ["$injector", "$delegate",
        function($injector, $delegate) {
          var $q = $injector.get('$q');
          var pcoUser = $injector.get('pcoUser');
          return $delegate.extend({
            /**
              * Get user object from pco
              * @returns {Object} Pco user Object
              */
              getUser: function() {
                return pcoUser;
              },
              getTempUnit: function () {
                return pcoUser.getTempUnit();
              },
              execute: function() {
                return $q.when(this.constructor.__super__.execute.apply(this, arguments));
              }
          });
      }]);
  }]);
}(window.TWC));;
/*
     _ _      _       _
 ___| (_) ___| | __  (_)___
/ __| | |/ __| |/ /  | / __|
\__ \ | | (__|   < _ | \__ \
|___/_|_|\___|_|\_(_)/ |___/
                   |__/

 Version: 1.5.9
  Author: Ken Wheeler
 Website: http://kenwheeler.github.io
    Docs: http://kenwheeler.github.io/slick
    Repo: http://github.com/kenwheeler/slick
  Issues: http://github.com/kenwheeler/slick/issues

 */
/* global window, document, define, jQuery, setInterval, clearInterval */
(function(factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], factory);
    } else if (typeof exports !== 'undefined') {
        module.exports = factory(require('jquery'));
    } else {
        factory(jQuery);
    }

}(function($) {
    'use strict';
    var Slick = window.Slick || {};

    Slick = (function() {

        var instanceUid = 0;

        function Slick(element, settings) {

            var _ = this, dataSettings;

            _.defaults = {
                accessibility: true,
                adaptiveHeight: false,
                appendArrows: $(element),
                appendDots: $(element),
                arrows: true,
                asNavFor: null,
                prevArrow: '<button type="button" data-role="none" class="slick-prev" aria-label="Previous" tabindex="0" role="button">Previous</button>',
                nextArrow: '<button type="button" data-role="none" class="slick-next" aria-label="Next" tabindex="0" role="button">Next</button>',
                autoplay: false,
                autoplaySpeed: 3000,
                centerMode: false,
                centerPadding: '50px',
                cssEase: 'ease',
                customPaging: function(slider, i) {
                    return '<button type="button" data-role="none" role="button" aria-required="false" tabindex="0">' + (i + 1) + '</button>';
                },
                dots: false,
                dotsClass: 'slick-dots',
                draggable: true,
                easing: 'linear',
                edgeFriction: 0.35,
                fade: false,
                focusOnSelect: false,
                infinite: true,
                initialSlide: 0,
                lazyLoad: 'ondemand',
                mobileFirst: false,
                pauseOnHover: true,
                pauseOnDotsHover: false,
                respondTo: 'window',
                responsive: null,
                rows: 1,
                rtl: false,
                slide: '',
                slidesPerRow: 1,
                slidesToShow: 1,
                slidesToScroll: 1,
                speed: 500,
                swipe: true,
                swipeToSlide: false,
                touchMove: true,
                touchThreshold: 5,
                useCSS: true,
                useTransform: false,
                variableWidth: false,
                vertical: false,
                verticalSwiping: false,
                waitForAnimate: true,
                zIndex: 1000
            };

            _.initials = {
                animating: false,
                dragging: false,
                autoPlayTimer: null,
                currentDirection: 0,
                currentLeft: null,
                currentSlide: 0,
                direction: 1,
                $dots: null,
                listWidth: null,
                listHeight: null,
                loadIndex: 0,
                $nextArrow: null,
                $prevArrow: null,
                slideCount: null,
                slideWidth: null,
                $slideTrack: null,
                $slides: null,
                sliding: false,
                slideOffset: 0,
                swipeLeft: null,
                $list: null,
                touchObject: {},
                transformsEnabled: false,
                unslicked: false
            };

            $.extend(_, _.initials);

            _.activeBreakpoint = null;
            _.animType = null;
            _.animProp = null;
            _.breakpoints = [];
            _.breakpointSettings = [];
            _.cssTransitions = false;
            _.hidden = 'hidden';
            _.paused = false;
            _.positionProp = null;
            _.respondTo = null;
            _.rowCount = 1;
            _.shouldClick = true;
            _.$slider = $(element);
            _.$slidesCache = null;
            _.transformType = null;
            _.transitionType = null;
            _.visibilityChange = 'visibilitychange';
            _.windowWidth = 0;
            _.windowTimer = null;

            dataSettings = $(element).data('slick') || {};

            _.options = $.extend({}, _.defaults, dataSettings, settings);

            _.currentSlide = _.options.initialSlide;

            _.originalSettings = _.options;

            if (typeof document.mozHidden !== 'undefined') {
                _.hidden = 'mozHidden';
                _.visibilityChange = 'mozvisibilitychange';
            } else if (typeof document.webkitHidden !== 'undefined') {
                _.hidden = 'webkitHidden';
                _.visibilityChange = 'webkitvisibilitychange';
            }

            _.autoPlay = $.proxy(_.autoPlay, _);
            _.autoPlayClear = $.proxy(_.autoPlayClear, _);
            _.changeSlide = $.proxy(_.changeSlide, _);
            _.clickHandler = $.proxy(_.clickHandler, _);
            _.selectHandler = $.proxy(_.selectHandler, _);
            _.setPosition = $.proxy(_.setPosition, _);
            _.swipeHandler = $.proxy(_.swipeHandler, _);
            _.dragHandler = $.proxy(_.dragHandler, _);
            _.keyHandler = $.proxy(_.keyHandler, _);
            _.autoPlayIterator = $.proxy(_.autoPlayIterator, _);

            _.instanceUid = instanceUid++;

            // A simple way to check for HTML strings
            // Strict HTML recognition (must start with <)
            // Extracted from jQuery v1.11 source
            _.htmlExpr = /^(?:\s*(<[\w\W]+>)[^>]*)$/;


            _.registerBreakpoints();
            _.init(true);
            _.checkResponsive(true);

        }

        return Slick;

    }());

    Slick.prototype.addSlide = Slick.prototype.slickAdd = function(markup, index, addBefore) {

        var _ = this;

        if (typeof(index) === 'boolean') {
            addBefore = index;
            index = null;
        } else if (index < 0 || (index >= _.slideCount)) {
            return false;
        }

        _.unload();

        if (typeof(index) === 'number') {
            if (index === 0 && _.$slides.length === 0) {
                $(markup).appendTo(_.$slideTrack);
            } else if (addBefore) {
                $(markup).insertBefore(_.$slides.eq(index));
            } else {
                $(markup).insertAfter(_.$slides.eq(index));
            }
        } else {
            if (addBefore === true) {
                $(markup).prependTo(_.$slideTrack);
            } else {
                $(markup).appendTo(_.$slideTrack);
            }
        }

        _.$slides = _.$slideTrack.children(this.options.slide);

        _.$slideTrack.children(this.options.slide).detach();

        _.$slideTrack.append(_.$slides);

        _.$slides.each(function(index, element) {
            $(element).attr('data-slick-index', index);
        });

        _.$slidesCache = _.$slides;

        _.reinit();

    };

    Slick.prototype.animateHeight = function() {
        var _ = this;
        if (_.options.slidesToShow === 1 && _.options.adaptiveHeight === true && _.options.vertical === false) {
            var targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true);
            _.$list.animate({
                height: targetHeight
            }, _.options.speed);
        }
    };

    Slick.prototype.animateSlide = function(targetLeft, callback) {

        var animProps = {},
            _ = this;

        _.animateHeight();

        if (_.options.rtl === true && _.options.vertical === false) {
            targetLeft = -targetLeft;
        }
        if (_.transformsEnabled === false) {
            if (_.options.vertical === false) {
                _.$slideTrack.animate({
                    left: targetLeft
                }, _.options.speed, _.options.easing, callback);
            } else {
                _.$slideTrack.animate({
                    top: targetLeft
                }, _.options.speed, _.options.easing, callback);
            }

        } else {

            if (_.cssTransitions === false) {
                if (_.options.rtl === true) {
                    _.currentLeft = -(_.currentLeft);
                }
                $({
                    animStart: _.currentLeft
                }).animate({
                    animStart: targetLeft
                }, {
                    duration: _.options.speed,
                    easing: _.options.easing,
                    step: function(now) {
                        now = Math.ceil(now);
                        if (_.options.vertical === false) {
                            animProps[_.animType] = 'translate(' +
                                now + 'px, 0px)';
                            _.$slideTrack.css(animProps);
                        } else {
                            animProps[_.animType] = 'translate(0px,' +
                                now + 'px)';
                            _.$slideTrack.css(animProps);
                        }
                    },
                    complete: function() {
                        if (callback) {
                            callback.call();
                        }
                    }
                });

            } else {

                _.applyTransition();
                targetLeft = Math.ceil(targetLeft);

                if (_.options.vertical === false) {
                    animProps[_.animType] = 'translate3d(' + targetLeft + 'px, 0px, 0px)';
                } else {
                    animProps[_.animType] = 'translate3d(0px,' + targetLeft + 'px, 0px)';
                }
                _.$slideTrack.css(animProps);

                if (callback) {
                    setTimeout(function() {

                        _.disableTransition();

                        callback.call();
                    }, _.options.speed);
                }

            }

        }

    };

    Slick.prototype.asNavFor = function(index) {

        var _ = this,
            asNavFor = _.options.asNavFor;

        if ( asNavFor && asNavFor !== null ) {
            asNavFor = $(asNavFor).not(_.$slider);
        }

        if ( asNavFor !== null && typeof asNavFor === 'object' ) {
            asNavFor.each(function() {
                var target = $(this).slick('getSlick');
                if(!target.unslicked) {
                    target.slideHandler(index, true);
                }
            });
        }

    };

    Slick.prototype.applyTransition = function(slide) {

        var _ = this,
            transition = {};

        if (_.options.fade === false) {
            transition[_.transitionType] = _.transformType + ' ' + _.options.speed + 'ms ' + _.options.cssEase;
        } else {
            transition[_.transitionType] = 'opacity ' + _.options.speed + 'ms ' + _.options.cssEase;
        }

        if (_.options.fade === false) {
            _.$slideTrack.css(transition);
        } else {
            _.$slides.eq(slide).css(transition);
        }

    };

    Slick.prototype.autoPlay = function() {

        var _ = this;

        if (_.autoPlayTimer) {
            clearInterval(_.autoPlayTimer);
        }

        if (_.slideCount > _.options.slidesToShow && _.paused !== true) {
            _.autoPlayTimer = setInterval(_.autoPlayIterator,
                _.options.autoplaySpeed);
        }

    };

    Slick.prototype.autoPlayClear = function() {

        var _ = this;
        if (_.autoPlayTimer) {
            clearInterval(_.autoPlayTimer);
        }

    };

    Slick.prototype.autoPlayIterator = function() {

        var _ = this;

        if (_.options.infinite === false) {

            if (_.direction === 1) {

                if ((_.currentSlide + 1) === _.slideCount -
                    1) {
                    _.direction = 0;
                }

                _.slideHandler(_.currentSlide + _.options.slidesToScroll);

            } else {

                if ((_.currentSlide - 1 === 0)) {

                    _.direction = 1;

                }

                _.slideHandler(_.currentSlide - _.options.slidesToScroll);

            }

        } else {

            _.slideHandler(_.currentSlide + _.options.slidesToScroll);

        }

    };

    Slick.prototype.buildArrows = function() {

        var _ = this;

        if (_.options.arrows === true ) {

            _.$prevArrow = $(_.options.prevArrow).addClass('slick-arrow');
            _.$nextArrow = $(_.options.nextArrow).addClass('slick-arrow');

            if( _.slideCount > _.options.slidesToShow ) {

                _.$prevArrow.removeClass('slick-hidden').removeAttr('aria-hidden tabindex');
                _.$nextArrow.removeClass('slick-hidden').removeAttr('aria-hidden tabindex');

                if (_.htmlExpr.test(_.options.prevArrow)) {
                    _.$prevArrow.prependTo(_.options.appendArrows);
                }

                if (_.htmlExpr.test(_.options.nextArrow)) {
                    _.$nextArrow.appendTo(_.options.appendArrows);
                }

                if (_.options.infinite !== true) {
                    _.$prevArrow
                        .addClass('slick-disabled')
                        .attr('aria-disabled', 'true');
                }

            } else {

                _.$prevArrow.add( _.$nextArrow )

                    .addClass('slick-hidden')
                    .attr({
                        'aria-disabled': 'true',
                        'tabindex': '-1'
                    });

            }

        }

    };

    Slick.prototype.buildDots = function() {

        var _ = this,
            i, dotString;

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {

            dotString = '<ul class="' + _.options.dotsClass + '">';

            for (i = 0; i <= _.getDotCount(); i += 1) {
                dotString += '<li>' + _.options.customPaging.call(this, _, i) + '</li>';
            }

            dotString += '</ul>';

            _.$dots = $(dotString).appendTo(
                _.options.appendDots);

            _.$dots.find('li').first().addClass('slick-active').attr('aria-hidden', 'false');

        }

    };

    Slick.prototype.buildOut = function() {

        var _ = this;

        _.$slides =
            _.$slider
                .children( _.options.slide + ':not(.slick-cloned)')
                .addClass('slick-slide');

        _.slideCount = _.$slides.length;

        _.$slides.each(function(index, element) {
            $(element)
                .attr('data-slick-index', index)
                .data('originalStyling', $(element).attr('style') || '');
        });

        _.$slider.addClass('slick-slider');

        _.$slideTrack = (_.slideCount === 0) ?
            $('<div class="slick-track"/>').appendTo(_.$slider) :
            _.$slides.wrapAll('<div class="slick-track"/>').parent();

        _.$list = _.$slideTrack.wrap(
            '<div aria-live="polite" class="slick-list"/>').parent();
        _.$slideTrack.css('opacity', 0);

        if (_.options.centerMode === true || _.options.swipeToSlide === true) {
            _.options.slidesToScroll = 1;
        }

        $('img[data-lazy]', _.$slider).not('[src]').addClass('slick-loading');

        _.setupInfinite();

        _.buildArrows();

        _.buildDots();

        _.updateDots();


        _.setSlideClasses(typeof _.currentSlide === 'number' ? _.currentSlide : 0);

        if (_.options.draggable === true) {
            _.$list.addClass('draggable');
        }

    };

    Slick.prototype.buildRows = function() {

        var _ = this, a, b, c, newSlides, numOfSlides, originalSlides,slidesPerSection;

        newSlides = document.createDocumentFragment();
        originalSlides = _.$slider.children();

        if(_.options.rows > 1) {

            slidesPerSection = _.options.slidesPerRow * _.options.rows;
            numOfSlides = Math.ceil(
                originalSlides.length / slidesPerSection
            );

            for(a = 0; a < numOfSlides; a++){
                var slide = document.createElement('div');
                for(b = 0; b < _.options.rows; b++) {
                    var row = document.createElement('div');
                    for(c = 0; c < _.options.slidesPerRow; c++) {
                        var target = (a * slidesPerSection + ((b * _.options.slidesPerRow) + c));
                        if (originalSlides.get(target)) {
                            row.appendChild(originalSlides.get(target));
                        }
                    }
                    slide.appendChild(row);
                }
                newSlides.appendChild(slide);
            }

            _.$slider.html(newSlides);
            _.$slider.children().children().children()
                .css({
                    'width':(100 / _.options.slidesPerRow) + '%',
                    'display': 'inline-block'
                });

        }

    };

    Slick.prototype.checkResponsive = function(initial, forceUpdate) {

        var _ = this,
            breakpoint, targetBreakpoint, respondToWidth, triggerBreakpoint = false;
        var sliderWidth = _.$slider.width();
        var windowWidth = window.innerWidth || $(window).width();

        if (_.respondTo === 'window') {
            respondToWidth = windowWidth;
        } else if (_.respondTo === 'slider') {
            respondToWidth = sliderWidth;
        } else if (_.respondTo === 'min') {
            respondToWidth = Math.min(windowWidth, sliderWidth);
        }

        if ( _.options.responsive &&
            _.options.responsive.length &&
            _.options.responsive !== null) {

            targetBreakpoint = null;

            for (breakpoint in _.breakpoints) {
                if (_.breakpoints.hasOwnProperty(breakpoint)) {
                    if (_.originalSettings.mobileFirst === false) {
                        if (respondToWidth < _.breakpoints[breakpoint]) {
                            targetBreakpoint = _.breakpoints[breakpoint];
                        }
                    } else {
                        if (respondToWidth > _.breakpoints[breakpoint]) {
                            targetBreakpoint = _.breakpoints[breakpoint];
                        }
                    }
                }
            }

            if (targetBreakpoint !== null) {
                if (_.activeBreakpoint !== null) {
                    if (targetBreakpoint !== _.activeBreakpoint || forceUpdate) {
                        _.activeBreakpoint =
                            targetBreakpoint;
                        if (_.breakpointSettings[targetBreakpoint] === 'unslick') {
                            _.unslick(targetBreakpoint);
                        } else {
                            _.options = $.extend({}, _.originalSettings,
                                _.breakpointSettings[
                                    targetBreakpoint]);
                            if (initial === true) {
                                _.currentSlide = _.options.initialSlide;
                            }
                            _.refresh(initial);
                        }
                        triggerBreakpoint = targetBreakpoint;
                    }
                } else {
                    _.activeBreakpoint = targetBreakpoint;
                    if (_.breakpointSettings[targetBreakpoint] === 'unslick') {
                        _.unslick(targetBreakpoint);
                    } else {
                        _.options = $.extend({}, _.originalSettings,
                            _.breakpointSettings[
                                targetBreakpoint]);
                        if (initial === true) {
                            _.currentSlide = _.options.initialSlide;
                        }
                        _.refresh(initial);
                    }
                    triggerBreakpoint = targetBreakpoint;
                }
            } else {
                if (_.activeBreakpoint !== null) {
                    _.activeBreakpoint = null;
                    _.options = _.originalSettings;
                    if (initial === true) {
                        _.currentSlide = _.options.initialSlide;
                    }
                    _.refresh(initial);
                    triggerBreakpoint = targetBreakpoint;
                }
            }

            // only trigger breakpoints during an actual break. not on initialize.
            if( !initial && triggerBreakpoint !== false ) {
                _.$slider.trigger('breakpoint', [_, triggerBreakpoint]);
            }
        }

    };

    Slick.prototype.changeSlide = function(event, dontAnimate) {

        var _ = this,
            $target = $(event.target),
            indexOffset, slideOffset, unevenOffset;

        // If target is a link, prevent default action.
        if($target.is('a')) {
            event.preventDefault();
        }

        // If target is not the <li> element (ie: a child), find the <li>.
        if(!$target.is('li')) {
            $target = $target.closest('li');
        }

        unevenOffset = (_.slideCount % _.options.slidesToScroll !== 0);
        indexOffset = unevenOffset ? 0 : (_.slideCount - _.currentSlide) % _.options.slidesToScroll;

        switch (event.data.message) {

            case 'previous':
                slideOffset = indexOffset === 0 ? _.options.slidesToScroll : _.options.slidesToShow - indexOffset;
                if (_.slideCount > _.options.slidesToShow) {
                    _.slideHandler(_.currentSlide - slideOffset, false, dontAnimate);
                }
                break;

            case 'next':
                slideOffset = indexOffset === 0 ? _.options.slidesToScroll : indexOffset;
                if (_.slideCount > _.options.slidesToShow) {
                    _.slideHandler(_.currentSlide + slideOffset, false, dontAnimate);
                }
                break;

            case 'index':
                var index = event.data.index === 0 ? 0 :
                    event.data.index || $target.index() * _.options.slidesToScroll;

                _.slideHandler(_.checkNavigable(index), false, dontAnimate);
                $target.children().trigger('focus');
                break;

            default:
                return;
        }

    };

    Slick.prototype.checkNavigable = function(index) {

        var _ = this,
            navigables, prevNavigable;

        navigables = _.getNavigableIndexes();
        prevNavigable = 0;
        if (index > navigables[navigables.length - 1]) {
            index = navigables[navigables.length - 1];
        } else {
            for (var n in navigables) {
                if (index < navigables[n]) {
                    index = prevNavigable;
                    break;
                }
                prevNavigable = navigables[n];
            }
        }

        return index;
    };

    Slick.prototype.cleanUpEvents = function() {

        var _ = this;

        if (_.options.dots && _.$dots !== null) {

            $('li', _.$dots).off('click.slick', _.changeSlide);

            if (_.options.pauseOnDotsHover === true && _.options.autoplay === true) {

                $('li', _.$dots)
                    .off('mouseenter.slick', $.proxy(_.setPaused, _, true))
                    .off('mouseleave.slick', $.proxy(_.setPaused, _, false));

            }

        }

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
            _.$prevArrow && _.$prevArrow.off('click.slick', _.changeSlide);
            _.$nextArrow && _.$nextArrow.off('click.slick', _.changeSlide);
        }

        _.$list.off('touchstart.slick mousedown.slick', _.swipeHandler);
        _.$list.off('touchmove.slick mousemove.slick', _.swipeHandler);
        _.$list.off('touchend.slick mouseup.slick', _.swipeHandler);
        _.$list.off('touchcancel.slick mouseleave.slick', _.swipeHandler);

        _.$list.off('click.slick', _.clickHandler);

        $(document).off(_.visibilityChange, _.visibility);

        _.$list.off('mouseenter.slick', $.proxy(_.setPaused, _, true));
        _.$list.off('mouseleave.slick', $.proxy(_.setPaused, _, false));

        if (_.options.accessibility === true) {
            _.$list.off('keydown.slick', _.keyHandler);
        }

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().off('click.slick', _.selectHandler);
        }

        $(window).off('orientationchange.slick.slick-' + _.instanceUid, _.orientationChange);

        $(window).off('resize.slick.slick-' + _.instanceUid, _.resize);

        $('[draggable!=true]', _.$slideTrack).off('dragstart', _.preventDefault);

        $(window).off('load.slick.slick-' + _.instanceUid, _.setPosition);
        $(document).off('ready.slick.slick-' + _.instanceUid, _.setPosition);
    };

    Slick.prototype.cleanUpRows = function() {

        var _ = this, originalSlides;

        if(_.options.rows > 1) {
            originalSlides = _.$slides.children().children();
            originalSlides.removeAttr('style');
            _.$slider.html(originalSlides);
        }

    };

    Slick.prototype.clickHandler = function(event) {

        var _ = this;

        if (_.shouldClick === false) {
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
        }

    };

    Slick.prototype.destroy = function(refresh) {

        var _ = this;

        _.autoPlayClear();

        _.touchObject = {};

        _.cleanUpEvents();

        $('.slick-cloned', _.$slider).detach();

        if (_.$dots) {
            _.$dots.remove();
        }


        if ( _.$prevArrow && _.$prevArrow.length ) {

            _.$prevArrow
                .removeClass('slick-disabled slick-arrow slick-hidden')
                .removeAttr('aria-hidden aria-disabled tabindex')
                .css("display","");

            if ( _.htmlExpr.test( _.options.prevArrow )) {
                _.$prevArrow.remove();
            }
        }

        if ( _.$nextArrow && _.$nextArrow.length ) {

            _.$nextArrow
                .removeClass('slick-disabled slick-arrow slick-hidden')
                .removeAttr('aria-hidden aria-disabled tabindex')
                .css("display","");

            if ( _.htmlExpr.test( _.options.nextArrow )) {
                _.$nextArrow.remove();
            }

        }


        if (_.$slides) {

            _.$slides
                .removeClass('slick-slide slick-active slick-center slick-visible slick-current')
                .removeAttr('aria-hidden')
                .removeAttr('data-slick-index')
                .each(function(){
                    $(this).attr('style', $(this).data('originalStyling'));
                });

            _.$slideTrack.children(this.options.slide).detach();

            _.$slideTrack.detach();

            _.$list.detach();

            _.$slider.append(_.$slides);
        }

        _.cleanUpRows();

        _.$slider.removeClass('slick-slider');
        _.$slider.removeClass('slick-initialized');

        _.unslicked = true;

        if(!refresh) {
            _.$slider.trigger('destroy', [_]);
        }

    };

    Slick.prototype.disableTransition = function(slide) {

        var _ = this,
            transition = {};

        transition[_.transitionType] = '';

        if (_.options.fade === false) {
            _.$slideTrack.css(transition);
        } else {
            _.$slides.eq(slide).css(transition);
        }

    };

    Slick.prototype.fadeSlide = function(slideIndex, callback) {

        var _ = this;

        if (_.cssTransitions === false) {

            _.$slides.eq(slideIndex).css({
                zIndex: _.options.zIndex
            });

            _.$slides.eq(slideIndex).animate({
                opacity: 1
            }, _.options.speed, _.options.easing, callback);

        } else {

            _.applyTransition(slideIndex);

            _.$slides.eq(slideIndex).css({
                opacity: 1,
                zIndex: _.options.zIndex
            });

            if (callback) {
                setTimeout(function() {

                    _.disableTransition(slideIndex);

                    callback.call();
                }, _.options.speed);
            }

        }

    };

    Slick.prototype.fadeSlideOut = function(slideIndex) {

        var _ = this;

        if (_.cssTransitions === false) {

            _.$slides.eq(slideIndex).animate({
                opacity: 0,
                zIndex: _.options.zIndex - 2
            }, _.options.speed, _.options.easing);

        } else {

            _.applyTransition(slideIndex);

            _.$slides.eq(slideIndex).css({
                opacity: 0,
                zIndex: _.options.zIndex - 2
            });

        }

    };

    Slick.prototype.filterSlides = Slick.prototype.slickFilter = function(filter) {

        var _ = this;

        if (filter !== null) {

            _.$slidesCache = _.$slides;

            _.unload();

            _.$slideTrack.children(this.options.slide).detach();

            _.$slidesCache.filter(filter).appendTo(_.$slideTrack);

            _.reinit();

        }

    };

    Slick.prototype.getCurrent = Slick.prototype.slickCurrentSlide = function() {

        var _ = this;
        return _.currentSlide;

    };

    Slick.prototype.getDotCount = function() {

        var _ = this;

        var breakPoint = 0;
        var counter = 0;
        var pagerQty = 0;

        if (_.options.infinite === true) {
            while (breakPoint < _.slideCount) {
                ++pagerQty;
                breakPoint = counter + _.options.slidesToScroll;
                counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
            }
        } else if (_.options.centerMode === true) {
            pagerQty = _.slideCount;
        } else {
            while (breakPoint < _.slideCount) {
                ++pagerQty;
                breakPoint = counter + _.options.slidesToScroll;
                counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
            }
        }

        return pagerQty - 1;

    };

    Slick.prototype.getLeft = function(slideIndex) {

        var _ = this,
            targetLeft,
            verticalHeight,
            verticalOffset = 0,
            targetSlide;

        _.slideOffset = 0;
        verticalHeight = _.$slides.first().outerHeight(true);

        if (_.options.infinite === true) {
            if (_.slideCount > _.options.slidesToShow) {
                _.slideOffset = (_.slideWidth * _.options.slidesToShow) * -1;
                verticalOffset = (verticalHeight * _.options.slidesToShow) * -1;
            }
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                if (slideIndex + _.options.slidesToScroll > _.slideCount && _.slideCount > _.options.slidesToShow) {
                    if (slideIndex > _.slideCount) {
                        _.slideOffset = ((_.options.slidesToShow - (slideIndex - _.slideCount)) * _.slideWidth) * -1;
                        verticalOffset = ((_.options.slidesToShow - (slideIndex - _.slideCount)) * verticalHeight) * -1;
                    } else {
                        _.slideOffset = ((_.slideCount % _.options.slidesToScroll) * _.slideWidth) * -1;
                        verticalOffset = ((_.slideCount % _.options.slidesToScroll) * verticalHeight) * -1;
                    }
                }
            }
        } else {
            if (slideIndex + _.options.slidesToShow > _.slideCount) {
                _.slideOffset = ((slideIndex + _.options.slidesToShow) - _.slideCount) * _.slideWidth;
                verticalOffset = ((slideIndex + _.options.slidesToShow) - _.slideCount) * verticalHeight;
            }
        }

        if (_.slideCount <= _.options.slidesToShow) {
            _.slideOffset = 0;
            verticalOffset = 0;
        }

        if (_.options.centerMode === true && _.options.infinite === true) {
            _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2) - _.slideWidth;
        } else if (_.options.centerMode === true) {
            _.slideOffset = 0;
            _.slideOffset += _.slideWidth * Math.floor(_.options.slidesToShow / 2);
        }

        if (_.options.vertical === false) {
            targetLeft = ((slideIndex * _.slideWidth) * -1) + _.slideOffset;
        } else {
            targetLeft = ((slideIndex * verticalHeight) * -1) + verticalOffset;
        }

        if (_.options.variableWidth === true) {

            if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
                targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex);
            } else {
                targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex + _.options.slidesToShow);
            }

            if (_.options.rtl === true) {
                if (targetSlide[0]) {
                    targetLeft = (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1;
                } else {
                    targetLeft =  0;
                }
            } else {
                targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0;
            }

            if (_.options.centerMode === true) {
                if (_.slideCount <= _.options.slidesToShow || _.options.infinite === false) {
                    targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex);
                } else {
                    targetSlide = _.$slideTrack.children('.slick-slide').eq(slideIndex + _.options.slidesToShow + 1);
                }

                if (_.options.rtl === true) {
                    if (targetSlide[0]) {
                        targetLeft = (_.$slideTrack.width() - targetSlide[0].offsetLeft - targetSlide.width()) * -1;
                    } else {
                        targetLeft =  0;
                    }
                } else {
                    targetLeft = targetSlide[0] ? targetSlide[0].offsetLeft * -1 : 0;
                }

                targetLeft += (_.$list.width() - targetSlide.outerWidth()) / 2;
            }
        }

        return targetLeft;

    };

    Slick.prototype.getOption = Slick.prototype.slickGetOption = function(option) {

        var _ = this;

        return _.options[option];

    };

    Slick.prototype.getNavigableIndexes = function() {

        var _ = this,
            breakPoint = 0,
            counter = 0,
            indexes = [],
            max;

        if (_.options.infinite === false) {
            max = _.slideCount;
        } else {
            breakPoint = _.options.slidesToScroll * -1;
            counter = _.options.slidesToScroll * -1;
            max = _.slideCount * 2;
        }

        while (breakPoint < max) {
            indexes.push(breakPoint);
            breakPoint = counter + _.options.slidesToScroll;
            counter += _.options.slidesToScroll <= _.options.slidesToShow ? _.options.slidesToScroll : _.options.slidesToShow;
        }

        return indexes;

    };

    Slick.prototype.getSlick = function() {

        return this;

    };

    Slick.prototype.getSlideCount = function() {

        var _ = this,
            slidesTraversed, swipedSlide, centerOffset;

        centerOffset = _.options.centerMode === true ? _.slideWidth * Math.floor(_.options.slidesToShow / 2) : 0;

        if (_.options.swipeToSlide === true) {
            _.$slideTrack.find('.slick-slide').each(function(index, slide) {
                if (slide.offsetLeft - centerOffset + ($(slide).outerWidth() / 2) > (_.swipeLeft * -1)) {
                    swipedSlide = slide;
                    return false;
                }
            });

            slidesTraversed = Math.abs($(swipedSlide).attr('data-slick-index') - _.currentSlide) || 1;

            return slidesTraversed;

        } else {
            return _.options.slidesToScroll;
        }

    };

    Slick.prototype.goTo = Slick.prototype.slickGoTo = function(slide, dontAnimate) {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'index',
                index: parseInt(slide)
            }
        }, dontAnimate);

    };

    Slick.prototype.init = function(creation) {

        var _ = this;

        if (!$(_.$slider).hasClass('slick-initialized')) {

            $(_.$slider).addClass('slick-initialized');

            _.buildRows();
            _.buildOut();
            _.setProps();
            _.startLoad();
            _.loadSlider();
            _.initializeEvents();
            _.updateArrows();
            _.updateDots();

        }

        if (creation) {
            _.$slider.trigger('init', [_]);
        }

        if (_.options.accessibility === true) {
            _.initADA();
        }

    };

    Slick.prototype.initArrowEvents = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {
            _.$prevArrow.on('click.slick', {
                message: 'previous'
            }, _.changeSlide);
            _.$nextArrow.on('click.slick', {
                message: 'next'
            }, _.changeSlide);
        }

    };

    Slick.prototype.initDotEvents = function() {

        var _ = this;

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {
            $('li', _.$dots).on('click.slick', {
                message: 'index'
            }, _.changeSlide);
        }

        if (_.options.dots === true && _.options.pauseOnDotsHover === true && _.options.autoplay === true) {
            $('li', _.$dots)
                .on('mouseenter.slick', $.proxy(_.setPaused, _, true))
                .on('mouseleave.slick', $.proxy(_.setPaused, _, false));
        }

    };

    Slick.prototype.initializeEvents = function() {

        var _ = this;

        _.initArrowEvents();

        _.initDotEvents();

        _.$list.on('touchstart.slick mousedown.slick', {
            action: 'start'
        }, _.swipeHandler);
        _.$list.on('touchmove.slick mousemove.slick', {
            action: 'move'
        }, _.swipeHandler);
        _.$list.on('touchend.slick mouseup.slick', {
            action: 'end'
        }, _.swipeHandler);
        _.$list.on('touchcancel.slick mouseleave.slick', {
            action: 'end'
        }, _.swipeHandler);

        _.$list.on('click.slick', _.clickHandler);

        $(document).on(_.visibilityChange, $.proxy(_.visibility, _));

        _.$list.on('mouseenter.slick', $.proxy(_.setPaused, _, true));
        _.$list.on('mouseleave.slick', $.proxy(_.setPaused, _, false));

        if (_.options.accessibility === true) {
            _.$list.on('keydown.slick', _.keyHandler);
        }

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().on('click.slick', _.selectHandler);
        }

        $(window).on('orientationchange.slick.slick-' + _.instanceUid, $.proxy(_.orientationChange, _));

        $(window).on('resize.slick.slick-' + _.instanceUid, $.proxy(_.resize, _));

        $('[draggable!=true]', _.$slideTrack).on('dragstart', _.preventDefault);

        $(window).on('load.slick.slick-' + _.instanceUid, _.setPosition);
        $(document).on('ready.slick.slick-' + _.instanceUid, _.setPosition);

    };

    Slick.prototype.initUI = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {

            _.$prevArrow.show();
            _.$nextArrow.show();

        }

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {

            _.$dots.show();

        }

        if (_.options.autoplay === true) {

            _.autoPlay();

        }

    };

    Slick.prototype.keyHandler = function(event) {

        var _ = this;
         //Dont slide if the cursor is inside the form fields and arrow keys are pressed
        if(!event.target.tagName.match('TEXTAREA|INPUT|SELECT')) {
            if (event.keyCode === 37 && _.options.accessibility === true) {
                _.changeSlide({
                    data: {
                        message: 'previous'
                    }
                });
            } else if (event.keyCode === 39 && _.options.accessibility === true) {
                _.changeSlide({
                    data: {
                        message: 'next'
                    }
                });
            }
        }

    };

    Slick.prototype.lazyLoad = function() {

        var _ = this,
            loadRange, cloneRange, rangeStart, rangeEnd;

        function loadImages(imagesScope) {
            $('img[data-lazy]', imagesScope).each(function() {

                var image = $(this),
                    imageSource = $(this).attr('data-lazy'),
                    imageToLoad = document.createElement('img');

                imageToLoad.onload = function() {
                    image
                        .animate({ opacity: 0 }, 100, function() {
                            image
                                .attr('src', imageSource)
                                .animate({ opacity: 1 }, 200, function() {
                                    image
                                        .removeAttr('data-lazy')
                                        .removeClass('slick-loading');
                                });
                        });
                };

                imageToLoad.src = imageSource;

            });
        }

        if (_.options.centerMode === true) {
            if (_.options.infinite === true) {
                rangeStart = _.currentSlide + (_.options.slidesToShow / 2 + 1);
                rangeEnd = rangeStart + _.options.slidesToShow + 2;
            } else {
                rangeStart = Math.max(0, _.currentSlide - (_.options.slidesToShow / 2 + 1));
                rangeEnd = 2 + (_.options.slidesToShow / 2 + 1) + _.currentSlide;
            }
        } else {
            rangeStart = _.options.infinite ? _.options.slidesToShow + _.currentSlide : _.currentSlide;
            rangeEnd = rangeStart + _.options.slidesToShow;
            if (_.options.fade === true) {
                if (rangeStart > 0) rangeStart--;
                if (rangeEnd <= _.slideCount) rangeEnd++;
            }
        }

        loadRange = _.$slider.find('.slick-slide').slice(rangeStart, rangeEnd);
        loadImages(loadRange);

        if (_.slideCount <= _.options.slidesToShow) {
            cloneRange = _.$slider.find('.slick-slide');
            loadImages(cloneRange);
        } else
        if (_.currentSlide >= _.slideCount - _.options.slidesToShow) {
            cloneRange = _.$slider.find('.slick-cloned').slice(0, _.options.slidesToShow);
            loadImages(cloneRange);
        } else if (_.currentSlide === 0) {
            cloneRange = _.$slider.find('.slick-cloned').slice(_.options.slidesToShow * -1);
            loadImages(cloneRange);
        }

    };

    Slick.prototype.loadSlider = function() {

        var _ = this;

        _.setPosition();

        _.$slideTrack.css({
            opacity: 1
        });

        _.$slider.removeClass('slick-loading');

        _.initUI();

        if (_.options.lazyLoad === 'progressive') {
            _.progressiveLazyLoad();
        }

    };

    Slick.prototype.next = Slick.prototype.slickNext = function() {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'next'
            }
        });

    };

    Slick.prototype.orientationChange = function() {

        var _ = this;

        _.checkResponsive();
        _.setPosition();

    };

    Slick.prototype.pause = Slick.prototype.slickPause = function() {

        var _ = this;

        _.autoPlayClear();
        _.paused = true;

    };

    Slick.prototype.play = Slick.prototype.slickPlay = function() {

        var _ = this;

        _.paused = false;
        _.autoPlay();

    };

    Slick.prototype.postSlide = function(index) {

        var _ = this;

        _.$slider.trigger('afterChange', [_, index]);

        _.animating = false;

        _.setPosition();

        _.swipeLeft = null;

        if (_.options.autoplay === true && _.paused === false) {
            _.autoPlay();
        }
        if (_.options.accessibility === true) {
            _.initADA();
        }

    };

    Slick.prototype.prev = Slick.prototype.slickPrev = function() {

        var _ = this;

        _.changeSlide({
            data: {
                message: 'previous'
            }
        });

    };

    Slick.prototype.preventDefault = function(event) {
        event.preventDefault();
    };

    Slick.prototype.progressiveLazyLoad = function() {

        var _ = this,
            imgCount, targetImage;

        imgCount = $('img[data-lazy]', _.$slider).length;

        if (imgCount > 0) {
            targetImage = $('img[data-lazy]', _.$slider).first();
            targetImage.attr('src', null);
            targetImage.attr('src', targetImage.attr('data-lazy')).removeClass('slick-loading').load(function() {
                    targetImage.removeAttr('data-lazy');
                    _.progressiveLazyLoad();

                    if (_.options.adaptiveHeight === true) {
                        _.setPosition();
                    }
                })
                .error(function() {
                    targetImage.removeAttr('data-lazy');
                    _.progressiveLazyLoad();
                });
        }

    };

    Slick.prototype.refresh = function( initializing ) {

        var _ = this, currentSlide, firstVisible;

        firstVisible = _.slideCount - _.options.slidesToShow;

        // check that the new breakpoint can actually accept the
        // "current slide" as the current slide, otherwise we need
        // to set it to the closest possible value.
        if ( !_.options.infinite ) {
            if ( _.slideCount <= _.options.slidesToShow ) {
                _.currentSlide = 0;
            } else if ( _.currentSlide > firstVisible ) {
                _.currentSlide = firstVisible;
            }
        }

         currentSlide = _.currentSlide;

        _.destroy(true);

        $.extend(_, _.initials, { currentSlide: currentSlide });

        _.init();

        if( !initializing ) {

            _.changeSlide({
                data: {
                    message: 'index',
                    index: currentSlide
                }
            }, false);

        }

    };

    Slick.prototype.registerBreakpoints = function() {

        var _ = this, breakpoint, currentBreakpoint, l,
            responsiveSettings = _.options.responsive || null;

        if ( $.type(responsiveSettings) === "array" && responsiveSettings.length ) {

            _.respondTo = _.options.respondTo || 'window';

            for ( breakpoint in responsiveSettings ) {

                l = _.breakpoints.length-1;
                currentBreakpoint = responsiveSettings[breakpoint].breakpoint;

                if (responsiveSettings.hasOwnProperty(breakpoint)) {

                    // loop through the breakpoints and cut out any existing
                    // ones with the same breakpoint number, we don't want dupes.
                    while( l >= 0 ) {
                        if( _.breakpoints[l] && _.breakpoints[l] === currentBreakpoint ) {
                            _.breakpoints.splice(l,1);
                        }
                        l--;
                    }

                    _.breakpoints.push(currentBreakpoint);
                    _.breakpointSettings[currentBreakpoint] = responsiveSettings[breakpoint].settings;

                }

            }

            _.breakpoints.sort(function(a, b) {
                return ( _.options.mobileFirst ) ? a-b : b-a;
            });

        }

    };

    Slick.prototype.reinit = function() {

        var _ = this;

        _.$slides =
            _.$slideTrack
                .children(_.options.slide)
                .addClass('slick-slide');

        _.slideCount = _.$slides.length;

        if (_.currentSlide >= _.slideCount && _.currentSlide !== 0) {
            _.currentSlide = _.currentSlide - _.options.slidesToScroll;
        }

        if (_.slideCount <= _.options.slidesToShow) {
            _.currentSlide = 0;
        }

        _.registerBreakpoints();

        _.setProps();
        _.setupInfinite();
        _.buildArrows();
        _.updateArrows();
        _.initArrowEvents();
        _.buildDots();
        _.updateDots();
        _.initDotEvents();

        _.checkResponsive(false, true);

        if (_.options.focusOnSelect === true) {
            $(_.$slideTrack).children().on('click.slick', _.selectHandler);
        }

        _.setSlideClasses(0);

        _.setPosition();

        _.$slider.trigger('reInit', [_]);

        if (_.options.autoplay === true) {
            _.focusHandler();
        }

    };

    Slick.prototype.resize = function() {

        var _ = this;

        if ($(window).width() !== _.windowWidth) {
            clearTimeout(_.windowDelay);
            _.windowDelay = window.setTimeout(function() {
                _.windowWidth = $(window).width();
                _.checkResponsive();
                if( !_.unslicked ) { _.setPosition(); }
            }, 50);
        }
    };

    Slick.prototype.removeSlide = Slick.prototype.slickRemove = function(index, removeBefore, removeAll) {

        var _ = this;

        if (typeof(index) === 'boolean') {
            removeBefore = index;
            index = removeBefore === true ? 0 : _.slideCount - 1;
        } else {
            index = removeBefore === true ? --index : index;
        }

        if (_.slideCount < 1 || index < 0 || index > _.slideCount - 1) {
            return false;
        }

        _.unload();

        if (removeAll === true) {
            _.$slideTrack.children().remove();
        } else {
            _.$slideTrack.children(this.options.slide).eq(index).remove();
        }

        _.$slides = _.$slideTrack.children(this.options.slide);

        _.$slideTrack.children(this.options.slide).detach();

        _.$slideTrack.append(_.$slides);

        _.$slidesCache = _.$slides;

        _.reinit();

    };

    Slick.prototype.setCSS = function(position) {

        var _ = this,
            positionProps = {},
            x, y;

        if (_.options.rtl === true) {
            position = -position;
        }
        x = _.positionProp == 'left' ? Math.ceil(position) + 'px' : '0px';
        y = _.positionProp == 'top' ? Math.ceil(position) + 'px' : '0px';

        positionProps[_.positionProp] = position;

        if (_.transformsEnabled === false) {
            _.$slideTrack.css(positionProps);
        } else {
            positionProps = {};
            if (_.cssTransitions === false) {
                positionProps[_.animType] = 'translate(' + x + ', ' + y + ')';
                _.$slideTrack.css(positionProps);
            } else {
                positionProps[_.animType] = 'translate3d(' + x + ', ' + y + ', 0px)';
                _.$slideTrack.css(positionProps);
            }
        }

    };

    Slick.prototype.setDimensions = function() {

        var _ = this;

        if (_.options.vertical === false) {
            if (_.options.centerMode === true) {
                _.$list.css({
                    padding: ('0px ' + _.options.centerPadding)
                });
            }
        } else {
            _.$list.height(_.$slides.first().outerHeight(true) * _.options.slidesToShow);
            if (_.options.centerMode === true) {
                _.$list.css({
                    padding: (_.options.centerPadding + ' 0px')
                });
            }
        }

        _.listWidth = _.$list.width();
        _.listHeight = _.$list.height();


        if (_.options.vertical === false && _.options.variableWidth === false) {
            _.slideWidth = Math.ceil(_.listWidth / _.options.slidesToShow);
            _.$slideTrack.width(Math.ceil((_.slideWidth * _.$slideTrack.children('.slick-slide').length)));

        } else if (_.options.variableWidth === true) {
            _.$slideTrack.width(5000 * _.slideCount);
        } else {
            _.slideWidth = Math.ceil(_.listWidth);
            _.$slideTrack.height(Math.ceil((_.$slides.first().outerHeight(true) * _.$slideTrack.children('.slick-slide').length)));
        }

        var offset = _.$slides.first().outerWidth(true) - _.$slides.first().width();
        if (_.options.variableWidth === false) _.$slideTrack.children('.slick-slide').width(_.slideWidth - offset);

    };

    Slick.prototype.setFade = function() {

        var _ = this,
            targetLeft;

        _.$slides.each(function(index, element) {
            targetLeft = (_.slideWidth * index) * -1;
            if (_.options.rtl === true) {
                $(element).css({
                    position: 'relative',
                    right: targetLeft,
                    top: 0,
                    zIndex: _.options.zIndex - 2,
                    opacity: 0
                });
            } else {
                $(element).css({
                    position: 'relative',
                    left: targetLeft,
                    top: 0,
                    zIndex: _.options.zIndex - 2,
                    opacity: 0
                });
            }
        });

        _.$slides.eq(_.currentSlide).css({
            zIndex: _.options.zIndex - 1,
            opacity: 1
        });

    };

    Slick.prototype.setHeight = function() {

        var _ = this;

        if (_.options.slidesToShow === 1 && _.options.adaptiveHeight === true && _.options.vertical === false) {
            var targetHeight = _.$slides.eq(_.currentSlide).outerHeight(true);
            _.$list.css('height', targetHeight);
        }

    };

    Slick.prototype.setOption = Slick.prototype.slickSetOption = function(option, value, refresh) {

        var _ = this, l, item;

        if( option === "responsive" && $.type(value) === "array" ) {
            for ( item in value ) {
                if( $.type( _.options.responsive ) !== "array" ) {
                    _.options.responsive = [ value[item] ];
                } else {
                    l = _.options.responsive.length-1;
                    // loop through the responsive object and splice out duplicates.
                    while( l >= 0 ) {
                        if( _.options.responsive[l].breakpoint === value[item].breakpoint ) {
                            _.options.responsive.splice(l,1);
                        }
                        l--;
                    }
                    _.options.responsive.push( value[item] );
                }
            }
        } else {
            _.options[option] = value;
        }

        if (refresh === true) {
            _.unload();
            _.reinit();
        }

    };

    Slick.prototype.setPosition = function() {

        var _ = this;

        _.setDimensions();

        _.setHeight();

        if (_.options.fade === false) {
            _.setCSS(_.getLeft(_.currentSlide));
        } else {
            _.setFade();
        }

        _.$slider.trigger('setPosition', [_]);

    };

    Slick.prototype.setProps = function() {

        var _ = this,
            bodyStyle = document.body.style;

        _.positionProp = _.options.vertical === true ? 'top' : 'left';

        if (_.positionProp === 'top') {
            _.$slider.addClass('slick-vertical');
        } else {
            _.$slider.removeClass('slick-vertical');
        }

        if (bodyStyle.WebkitTransition !== undefined ||
            bodyStyle.MozTransition !== undefined ||
            bodyStyle.msTransition !== undefined) {
            if (_.options.useCSS === true) {
                _.cssTransitions = true;
            }
        }

        if ( _.options.fade ) {
            if ( typeof _.options.zIndex === 'number' ) {
                if( _.options.zIndex < 3 ) {
                    _.options.zIndex = 3;
                }
            } else {
                _.options.zIndex = _.defaults.zIndex;
            }
        }

        if (bodyStyle.OTransform !== undefined) {
            _.animType = 'OTransform';
            _.transformType = '-o-transform';
            _.transitionType = 'OTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.webkitPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.MozTransform !== undefined) {
            _.animType = 'MozTransform';
            _.transformType = '-moz-transform';
            _.transitionType = 'MozTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.MozPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.webkitTransform !== undefined) {
            _.animType = 'webkitTransform';
            _.transformType = '-webkit-transform';
            _.transitionType = 'webkitTransition';
            if (bodyStyle.perspectiveProperty === undefined && bodyStyle.webkitPerspective === undefined) _.animType = false;
        }
        if (bodyStyle.msTransform !== undefined) {
            _.animType = 'msTransform';
            _.transformType = '-ms-transform';
            _.transitionType = 'msTransition';
            if (bodyStyle.msTransform === undefined) _.animType = false;
        }
        if (bodyStyle.transform !== undefined && _.animType !== false) {
            _.animType = 'transform';
            _.transformType = 'transform';
            _.transitionType = 'transition';
        }
        _.transformsEnabled = _.options.useTransform && (_.animType !== null && _.animType !== false);
    };


    Slick.prototype.setSlideClasses = function(index) {

        var _ = this,
            centerOffset, allSlides, indexOffset, remainder;

        allSlides = _.$slider
            .find('.slick-slide')
            .removeClass('slick-active slick-center slick-current')
            .attr('aria-hidden', 'true');

        _.$slides
            .eq(index)
            .addClass('slick-current');

        if (_.options.centerMode === true) {

            centerOffset = Math.floor(_.options.slidesToShow / 2);

            if (_.options.infinite === true) {

                if (index >= centerOffset && index <= (_.slideCount - 1) - centerOffset) {

                    _.$slides
                        .slice(index - centerOffset, index + centerOffset + 1)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                } else {

                    indexOffset = _.options.slidesToShow + index;
                    allSlides
                        .slice(indexOffset - centerOffset + 1, indexOffset + centerOffset + 2)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                }

                if (index === 0) {

                    allSlides
                        .eq(allSlides.length - 1 - _.options.slidesToShow)
                        .addClass('slick-center');

                } else if (index === _.slideCount - 1) {

                    allSlides
                        .eq(_.options.slidesToShow)
                        .addClass('slick-center');

                }

            }

            _.$slides
                .eq(index)
                .addClass('slick-center');

        } else {

            if (index >= 0 && index <= (_.slideCount - _.options.slidesToShow)) {

                _.$slides
                    .slice(index, index + _.options.slidesToShow)
                    .addClass('slick-active')
                    .attr('aria-hidden', 'false');

            } else if (allSlides.length <= _.options.slidesToShow) {

                allSlides
                    .addClass('slick-active')
                    .attr('aria-hidden', 'false');

            } else {

                remainder = _.slideCount % _.options.slidesToShow;
                indexOffset = _.options.infinite === true ? _.options.slidesToShow + index : index;

                if (_.options.slidesToShow == _.options.slidesToScroll && (_.slideCount - index) < _.options.slidesToShow) {

                    allSlides
                        .slice(indexOffset - (_.options.slidesToShow - remainder), indexOffset + remainder)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                } else {

                    allSlides
                        .slice(indexOffset, indexOffset + _.options.slidesToShow)
                        .addClass('slick-active')
                        .attr('aria-hidden', 'false');

                }

            }

        }

        if (_.options.lazyLoad === 'ondemand') {
            _.lazyLoad();
        }

    };

    Slick.prototype.setupInfinite = function() {

        var _ = this,
            i, slideIndex, infiniteCount;

        if (_.options.fade === true) {
            _.options.centerMode = false;
        }

        if (_.options.infinite === true && _.options.fade === false) {

            slideIndex = null;

            if (_.slideCount > _.options.slidesToShow) {

                if (_.options.centerMode === true) {
                    infiniteCount = _.options.slidesToShow + 1;
                } else {
                    infiniteCount = _.options.slidesToShow;
                }

                for (i = _.slideCount; i > (_.slideCount -
                        infiniteCount); i -= 1) {
                    slideIndex = i - 1;
                    $(_.$slides[slideIndex]).clone(true).attr('id', '')
                        .attr('data-slick-index', slideIndex - _.slideCount)
                        .prependTo(_.$slideTrack).addClass('slick-cloned');
                }
                for (i = 0; i < infiniteCount; i += 1) {
                    slideIndex = i;
                    $(_.$slides[slideIndex]).clone(true).attr('id', '')
                        .attr('data-slick-index', slideIndex + _.slideCount)
                        .appendTo(_.$slideTrack).addClass('slick-cloned');
                }
                _.$slideTrack.find('.slick-cloned').find('[id]').each(function() {
                    $(this).attr('id', '');
                });

            }

        }

    };

    Slick.prototype.setPaused = function(paused) {

        var _ = this;

        if (_.options.autoplay === true && _.options.pauseOnHover === true) {
            _.paused = paused;
            if (!paused) {
                _.autoPlay();
            } else {
                _.autoPlayClear();
            }
        }
    };

    Slick.prototype.selectHandler = function(event) {

        var _ = this;

        var targetElement =
            $(event.target).is('.slick-slide') ?
                $(event.target) :
                $(event.target).parents('.slick-slide');

        var index = parseInt(targetElement.attr('data-slick-index'));

        if (!index) index = 0;

        if (_.slideCount <= _.options.slidesToShow) {

            _.setSlideClasses(index);
            _.asNavFor(index);
            return;

        }

        _.slideHandler(index);

    };

    Slick.prototype.slideHandler = function(index, sync, dontAnimate) {

        var targetSlide, animSlide, oldSlide, slideLeft, targetLeft = null,
            _ = this;

        sync = sync || false;

        if (_.animating === true && _.options.waitForAnimate === true) {
            return;
        }

        if (_.options.fade === true && _.currentSlide === index) {
            return;
        }

        if (_.slideCount <= _.options.slidesToShow) {
            return;
        }

        if (sync === false) {
            _.asNavFor(index);
        }

        targetSlide = index;
        targetLeft = _.getLeft(targetSlide);
        slideLeft = _.getLeft(_.currentSlide);

        _.currentLeft = _.swipeLeft === null ? slideLeft : _.swipeLeft;

        if (_.options.infinite === false && _.options.centerMode === false && (index < 0 || index > _.getDotCount() * _.options.slidesToScroll)) {
            if (_.options.fade === false) {
                targetSlide = _.currentSlide;
                if (dontAnimate !== true) {
                    _.animateSlide(slideLeft, function() {
                        _.postSlide(targetSlide);
                    });
                } else {
                    _.postSlide(targetSlide);
                }
            }
            return;
        } else if (_.options.infinite === false && _.options.centerMode === true && (index < 0 || index > (_.slideCount - _.options.slidesToScroll))) {
            if (_.options.fade === false) {
                targetSlide = _.currentSlide;
                if (dontAnimate !== true) {
                    _.animateSlide(slideLeft, function() {
                        _.postSlide(targetSlide);
                    });
                } else {
                    _.postSlide(targetSlide);
                }
            }
            return;
        }

        if (_.options.autoplay === true) {
            clearInterval(_.autoPlayTimer);
        }

        if (targetSlide < 0) {
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                animSlide = _.slideCount - (_.slideCount % _.options.slidesToScroll);
            } else {
                animSlide = _.slideCount + targetSlide;
            }
        } else if (targetSlide >= _.slideCount) {
            if (_.slideCount % _.options.slidesToScroll !== 0) {
                animSlide = 0;
            } else {
                animSlide = targetSlide - _.slideCount;
            }
        } else {
            animSlide = targetSlide;
        }

        _.animating = true;

        _.$slider.trigger('beforeChange', [_, _.currentSlide, animSlide]);

        oldSlide = _.currentSlide;
        _.currentSlide = animSlide;

        _.setSlideClasses(_.currentSlide);

        _.updateDots();
        _.updateArrows();

        if (_.options.fade === true) {
            if (dontAnimate !== true) {

                _.fadeSlideOut(oldSlide);

                _.fadeSlide(animSlide, function() {
                    _.postSlide(animSlide);
                });

            } else {
                _.postSlide(animSlide);
            }
            _.animateHeight();
            return;
        }

        if (dontAnimate !== true) {
            _.animateSlide(targetLeft, function() {
                _.postSlide(animSlide);
            });
        } else {
            _.postSlide(animSlide);
        }

    };

    Slick.prototype.startLoad = function() {

        var _ = this;

        if (_.options.arrows === true && _.slideCount > _.options.slidesToShow) {

            _.$prevArrow.hide();
            _.$nextArrow.hide();

        }

        if (_.options.dots === true && _.slideCount > _.options.slidesToShow) {

            _.$dots.hide();

        }

        _.$slider.addClass('slick-loading');

    };

    Slick.prototype.swipeDirection = function() {

        var xDist, yDist, r, swipeAngle, _ = this;

        xDist = _.touchObject.startX - _.touchObject.curX;
        yDist = _.touchObject.startY - _.touchObject.curY;
        r = Math.atan2(yDist, xDist);

        swipeAngle = Math.round(r * 180 / Math.PI);
        if (swipeAngle < 0) {
            swipeAngle = 360 - Math.abs(swipeAngle);
        }

        if ((swipeAngle <= 45) && (swipeAngle >= 0)) {
            return (_.options.rtl === false ? 'left' : 'right');
        }
        if ((swipeAngle <= 360) && (swipeAngle >= 315)) {
            return (_.options.rtl === false ? 'left' : 'right');
        }
        if ((swipeAngle >= 135) && (swipeAngle <= 225)) {
            return (_.options.rtl === false ? 'right' : 'left');
        }
        if (_.options.verticalSwiping === true) {
            if ((swipeAngle >= 35) && (swipeAngle <= 135)) {
                return 'left';
            } else {
                return 'right';
            }
        }

        return 'vertical';

    };

    Slick.prototype.swipeEnd = function(event) {

        var _ = this,
            slideCount;

        _.dragging = false;

        _.shouldClick = (_.touchObject.swipeLength > 10) ? false : true;

        if (_.touchObject.curX === undefined) {
            return false;
        }

        if (_.touchObject.edgeHit === true) {
            _.$slider.trigger('edge', [_, _.swipeDirection()]);
        }

        if (_.touchObject.swipeLength >= _.touchObject.minSwipe) {

            switch (_.swipeDirection()) {
                case 'left':
                    slideCount = _.options.swipeToSlide ? _.checkNavigable(_.currentSlide + _.getSlideCount()) : _.currentSlide + _.getSlideCount();
                    _.slideHandler(slideCount);
                    _.currentDirection = 0;
                    _.touchObject = {};
                    _.$slider.trigger('swipe', [_, 'left']);
                    break;

                case 'right':
                    slideCount = _.options.swipeToSlide ? _.checkNavigable(_.currentSlide - _.getSlideCount()) : _.currentSlide - _.getSlideCount();
                    _.slideHandler(slideCount);
                    _.currentDirection = 1;
                    _.touchObject = {};
                    _.$slider.trigger('swipe', [_, 'right']);
                    break;
            }
        } else {
            if (_.touchObject.startX !== _.touchObject.curX) {
                _.slideHandler(_.currentSlide);
                _.touchObject = {};
            }
        }

    };

    Slick.prototype.swipeHandler = function(event) {

        var _ = this;

        if ((_.options.swipe === false) || ('ontouchend' in document && _.options.swipe === false)) {
            return;
        } else if (_.options.draggable === false && event.type.indexOf('mouse') !== -1) {
            return;
        }

        _.touchObject.fingerCount = event.originalEvent && event.originalEvent.touches !== undefined ?
            event.originalEvent.touches.length : 1;

        _.touchObject.minSwipe = _.listWidth / _.options
            .touchThreshold;

        if (_.options.verticalSwiping === true) {
            _.touchObject.minSwipe = _.listHeight / _.options
                .touchThreshold;
        }

        switch (event.data.action) {

            case 'start':
                _.swipeStart(event);
                break;

            case 'move':
                _.swipeMove(event);
                break;

            case 'end':
                _.swipeEnd(event);
                break;

        }

    };

    Slick.prototype.swipeMove = function(event) {

        var _ = this,
            edgeWasHit = false,
            curLeft, swipeDirection, swipeLength, positionOffset, touches;

        touches = event.originalEvent !== undefined ? event.originalEvent.touches : null;

        if (!_.dragging || touches && touches.length !== 1) {
            return false;
        }

        curLeft = _.getLeft(_.currentSlide);

        _.touchObject.curX = touches !== undefined ? touches[0].pageX : event.clientX;
        _.touchObject.curY = touches !== undefined ? touches[0].pageY : event.clientY;

        _.touchObject.swipeLength = Math.round(Math.sqrt(
            Math.pow(_.touchObject.curX - _.touchObject.startX, 2)));

        if (_.options.verticalSwiping === true) {
            _.touchObject.swipeLength = Math.round(Math.sqrt(
                Math.pow(_.touchObject.curY - _.touchObject.startY, 2)));
        }

        swipeDirection = _.swipeDirection();

        if (swipeDirection === 'vertical') {
            return;
        }

        if (event.originalEvent !== undefined && _.touchObject.swipeLength > 4) {
            event.preventDefault();
        }

        positionOffset = (_.options.rtl === false ? 1 : -1) * (_.touchObject.curX > _.touchObject.startX ? 1 : -1);
        if (_.options.verticalSwiping === true) {
            positionOffset = _.touchObject.curY > _.touchObject.startY ? 1 : -1;
        }


        swipeLength = _.touchObject.swipeLength;

        _.touchObject.edgeHit = false;

        if (_.options.infinite === false) {
            if ((_.currentSlide === 0 && swipeDirection === 'right') || (_.currentSlide >= _.getDotCount() && swipeDirection === 'left')) {
                swipeLength = _.touchObject.swipeLength * _.options.edgeFriction;
                _.touchObject.edgeHit = true;
            }
        }

        if (_.options.vertical === false) {
            _.swipeLeft = curLeft + swipeLength * positionOffset;
        } else {
            _.swipeLeft = curLeft + (swipeLength * (_.$list.height() / _.listWidth)) * positionOffset;
        }
        if (_.options.verticalSwiping === true) {
            _.swipeLeft = curLeft + swipeLength * positionOffset;
        }

        if (_.options.fade === true || _.options.touchMove === false) {
            return false;
        }

        if (_.animating === true) {
            _.swipeLeft = null;
            return false;
        }

        _.setCSS(_.swipeLeft);

    };

    Slick.prototype.swipeStart = function(event) {

        var _ = this,
            touches;

        if (_.touchObject.fingerCount !== 1 || _.slideCount <= _.options.slidesToShow) {
            _.touchObject = {};
            return false;
        }

        if (event.originalEvent !== undefined && event.originalEvent.touches !== undefined) {
            touches = event.originalEvent.touches[0];
        }

        _.touchObject.startX = _.touchObject.curX = touches !== undefined ? touches.pageX : event.clientX;
        _.touchObject.startY = _.touchObject.curY = touches !== undefined ? touches.pageY : event.clientY;

        _.dragging = true;

    };

    Slick.prototype.unfilterSlides = Slick.prototype.slickUnfilter = function() {

        var _ = this;

        if (_.$slidesCache !== null) {

            _.unload();

            _.$slideTrack.children(this.options.slide).detach();

            _.$slidesCache.appendTo(_.$slideTrack);

            _.reinit();

        }

    };

    Slick.prototype.unload = function() {

        var _ = this;

        $('.slick-cloned', _.$slider).remove();

        if (_.$dots) {
            _.$dots.remove();
        }

        if (_.$prevArrow && _.htmlExpr.test(_.options.prevArrow)) {
            _.$prevArrow.remove();
        }

        if (_.$nextArrow && _.htmlExpr.test(_.options.nextArrow)) {
            _.$nextArrow.remove();
        }

        _.$slides
            .removeClass('slick-slide slick-active slick-visible slick-current')
            .attr('aria-hidden', 'true')
            .css('width', '');

    };

    Slick.prototype.unslick = function(fromBreakpoint) {

        var _ = this;
        _.$slider.trigger('unslick', [_, fromBreakpoint]);
        _.destroy();

    };

    Slick.prototype.updateArrows = function() {

        var _ = this,
            centerOffset;

        centerOffset = Math.floor(_.options.slidesToShow / 2);

        if ( _.options.arrows === true &&
            _.slideCount > _.options.slidesToShow &&
            !_.options.infinite ) {

            _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');
            _.$nextArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            if (_.currentSlide === 0) {

                _.$prevArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$nextArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            } else if (_.currentSlide >= _.slideCount - _.options.slidesToShow && _.options.centerMode === false) {

                _.$nextArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            } else if (_.currentSlide >= _.slideCount - 1 && _.options.centerMode === true) {

                _.$nextArrow.addClass('slick-disabled').attr('aria-disabled', 'true');
                _.$prevArrow.removeClass('slick-disabled').attr('aria-disabled', 'false');

            }

        }

    };

    Slick.prototype.updateDots = function() {

        var _ = this;

        if (_.$dots !== null) {

            _.$dots
                .find('li')
                .removeClass('slick-active')
                .attr('aria-hidden', 'true');

            _.$dots
                .find('li')
                .eq(Math.floor(_.currentSlide / _.options.slidesToScroll))
                .addClass('slick-active')
                .attr('aria-hidden', 'false');

        }

    };

    Slick.prototype.visibility = function() {

        var _ = this;

        if (document[_.hidden]) {
            _.paused = true;
            _.autoPlayClear();
        } else {
            if (_.options.autoplay === true) {
                _.paused = false;
                _.autoPlay();
            }
        }

    };
    Slick.prototype.initADA = function() {
        var _ = this;
        _.$slides.add(_.$slideTrack.find('.slick-cloned')).attr({
            'aria-hidden': 'true',
            'tabindex': '-1'
        }).find('a, input, button, select').attr({
            'tabindex': '-1'
        });

        _.$slideTrack.attr('role', 'listbox');

        _.$slides.not(_.$slideTrack.find('.slick-cloned')).each(function(i) {
            $(this).attr({
                'role': 'option',
                'aria-describedby': 'slick-slide' + _.instanceUid + i + ''
            });
        });

        if (_.$dots !== null) {
            _.$dots.attr('role', 'tablist').find('li').each(function(i) {
                $(this).attr({
                    'role': 'presentation',
                    'aria-selected': 'false',
                    'aria-controls': 'navigation' + _.instanceUid + i + '',
                    'id': 'slick-slide' + _.instanceUid + i + ''
                });
            })
                .first().attr('aria-selected', 'true').end()
                .find('button').attr('role', 'button').end()
                .closest('div').attr('role', 'toolbar');
        }
        _.activateADA();

    };

    Slick.prototype.activateADA = function() {
        var _ = this;

        _.$slideTrack.find('.slick-active').attr({
            'aria-hidden': 'false'
        }).find('a, input, button, select').attr({
            'tabindex': '0'
        });

    };

    Slick.prototype.focusHandler = function() {
        var _ = this;
        _.$slider.on('focus.slick blur.slick', '*', function(event) {
            event.stopImmediatePropagation();
            var sf = $(this);
            setTimeout(function() {
                if (_.isPlay) {
                    if (sf.is(':focus')) {
                        _.autoPlayClear();
                        _.paused = true;
                    } else {
                        _.paused = false;
                        _.autoPlay();
                    }
                }
            }, 0);
        });
    };

    $.fn.slick = function() {
        var _ = this,
            opt = arguments[0],
            args = Array.prototype.slice.call(arguments, 1),
            l = _.length,
            i,
            ret;
        for (i = 0; i < l; i++) {
            if (typeof opt == 'object' || typeof opt == 'undefined')
                _[i].slick = new Slick(_[i], opt);
            else
                ret = _[i].slick[opt].apply(_[i].slick, args);
            if (typeof ret != 'undefined') return ret;
        }
        return _;
    };

}));
;
/* global twc */
/**
 * Author: Cord Hamrick
 * Date: 2014-09-16
 * Time: 2:00pm
 * Comments:
 */
twc.shared.apps
  .factory('CmsAssetListModelClass', [ 'CmsAModelClass', 'pcoUser', function(CmsAModelClass, pcoUser) {
    return CmsAModelClass.extend({
      recordType: 'CmsAssetList',

      construct: function() {
        CmsAModelClass.prototype.construct.apply(this, arguments);
      },

      setResponse: function(response) {
        this.data = response;
        this.header = "NA";
      },

      getThumbnail: function() {
        // obtain variants from returned data
        var objVariants = this._get('variants');
        var thumbnailUrl = objVariants[2] || '';
        return thumbnailUrl;
      }

    });
}]);;
/**
 * preload directive
 * @type {shared|*|{}}
 *
 * DESCRIPTION:
 *
 * The preload directive handles loading state for specified controllers,
 * and  injects shared HTML code into the module.
 *
 *
 * IMPLEMENTATION:
 *
 * 1. declare scope variables in your controller,
 *    $scope.isLoading: true on controller intialize,
 *                      false after dsx response is returned
 *
 * 2. Use ng-switch wrapper around the template parts you want to toggle:
 *
 *    <div ng-switch on="isLoading">
 *
 * 3. Add in preload state, and invoke the preloader :
 *
 *    <div ng-switch-when="true" preload> </div>
 *
 * 4. Add in default state, where the default content goes:
 *
 *    <div ng-switch-default>
 *
 *      <!-- ** module content ** // -->
 *
 *    </div>
 *
 * 5. Close the ng-switch container:
 *
 *    </div>
 *
 * CUSTOMIZATION:
 *
 * The preload directive delivers with defaults, via SASS mixins:
 *
 *    +preloadDefaults
 *    +preloadKeyframes
 *
 * Any one of these defaults may be overridden via a SASS mixin:
 *
 *    +preload (position, opacity, border radius)
 *    +preloadSizeAndBorder (overall size, border size)
 *    +preloadColor (background color, border color)
 *    +preloadDuration (time)
 *    +preloadDelay (animation delay)
 *
 */
twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.directive('preload', function () {
  var preloadDefinition = {
    priority: 0,
    replace: false,
    template: '<div class="loading clearfix"><div class="preloader" data-anim="base wrapper"><div class="left-wrap"><div class="circle left" data-anim="base left"></div></div><div class="right-wrap"><div class="circle right" data-anim="base right"></div></div></div></div>',
    scope: true,
    restrict: 'A'
  };

  return preloadDefinition;
});
;
/**
 * error handler directive
 * @type {shared|*|{}}
 *
 * DESCRIPTION:
 *
 * The error handler directive displays a module error state with internationalized text.
 * The stylesheet has light and dark themes available as well as small and large EQ breakpoints.
 *
 * DEPENDENCIES:
 *
 * twcConfig.module_status_codes - This object contains references to global status strings
 *
 * USAGE:
 *
 * Controller - The controller should contain logic to flag a scope variable to reflect the module
 * status. Generally speaking, this will occur in the dsxclient promise block.
 *
 * $scope.status = twcConfig.module_status_codes.LOADING
 * dsxclient
 *  .execute([
 *    {$id: "forecast", recordType: "wsd", recordName: "DFRecord", fullLocId: $scope.locId}
 *   ])
 *   .addResultsTo($scope)
 *   .then(function (response) {
 *     $scope.status = !$scope.forecast ? twcConfig.module_status_codes.ERROR : twcConfig.module_status_codes.DEFAULT;
 *   })
 *   ["catch"](function () {
 *     $scope.status = twcConfig.module_status_codes.ERROR;
 *   });
 *
 * Template - Generally speaking this directive will be used in conjunction with an ng-switch
 * block.
 *
 * <div data-ng-switch data-on="status">
 *   <div data-ng-switch-when="loading" data-preload></div>
 *   <div data-ng-switch-when="error" error-handler="status" error-handler-theme="dark"></div>
 *   <div data-ng-switch-default>
 *     Module Content
 *   </div>
 * </div>
 *
 * OPTIONS:
 *
 * error-handler: Pass the module status code to the directive
 * error-handler-theme: Defaults to light, but can be set to dark
 * error-handler-message: Defaults to generic verbiage also supports the following:
 *    na - Data is not currently available for this location.
 *    generic/default - Looks like this feature didn't load properly. Please check back soon.
 */

twc.shared = twc.shared || {};
twc.shared.apps = twc.shared.apps || angular.module('shared', []);
twc.shared.apps.directive('errorHandler',['twcConfig','$compile', function (twcConfig, $compile) {
  var errorHandlerDefinition = {
    priority: 0,
    replace: true,
    template: '<div data-ng-if="hasError" class="wx-module-error" data-ng-class="{dark: errorHandlerTheme === \'dark\'}">\n    <div class="wx-module-error-content">\n        <span class="wx-iconfont-global wx-icon-error-2"></span>\n        <div class="messaging">\n            <p class="error-title" data-ng-bind-template="{{errorTitle | translate}}"></p>\n            <p class="error-description"  data-ng-bind-template="{{errorDescription | translate}}"></p>\n        </div>\n    </div>\n</div>\n',
    scope: {
      errorHandler: '=',
      errorHandlerMode: '@',
      errorHandlerTheme:'@'
    },
    restrict: 'A',
    link: function ($scope) {

      $scope.hasError = $scope.errorHandler === twcConfig.module_status_codes.ERROR;

      $scope.funcs = {
        myErrorHandler: function () {
          switch ($scope.errorHandlerMode) {
            case 'na':
              $scope.errorTitle = 'error_handler.NOT_AVAILABLE_TITLE';
              $scope.errorDescription = 'error_handler.NOT_AVAILABLE_DESCRIPTION';
              break;
            case 'generic':
              $scope.errorTitle = 'error_handler.GENERIC_ERROR_TITLE';
              $scope.errorDescription = 'error_handler.GENERIC_ERROR_DESCRIPTION';
              break;
            default:
              $scope.errorTitle = 'error_handler.GENERIC_ERROR_TITLE';
              $scope.errorDescription = 'error_handler.GENERIC_ERROR_DESCRIPTION';
          }
        }
      };

      $scope.funcs.myErrorHandler();

      $scope.$watch('errorHandler', function (nVal, oVal) {
        $scope.hasError = nVal === 'error';

      });

      $scope.$watch('errorHandlerMode', function (nVal, oVal) {

        if (nVal !== oVal) {
          $scope.errorHandlerMode = nVal;
          $scope.funcs.myErrorHandler();

        }
      });
    }
  };

  return errorHandlerDefinition;
}]);
;
/**
 * Author: ksankaran (Velu)
 * Date: 9/26/14
 * Time: 4:15 PM
 * Comments:
 */

twc.shared.apps.factory('CmsAffiliateVideosModelClass',['RecordModel',function(RecordModel){
  return RecordModel.extend({
    recordType: 'CmsAffiliateVideosModelClass',

    setResponse: function (response) {
      this.data = response;
    },

    getAssets: function () {
      return this._get("assets");
    },

    getNetwork: function () {
      return this._get("network");
    },

    getCollection: function () {
      return this._get('collection');
    }
  });
}]);;
/*
 * angular-ui-bootstrap
 * http://angular-ui.github.io/bootstrap/

 * Version: 0.13.4 - 2015-09-03
 * License: MIT
 */
angular.module("ui.bootstrap",["ui.bootstrap.tpls","ui.bootstrap.collapse","ui.bootstrap.bindHtml","ui.bootstrap.dropdown","ui.bootstrap.position","ui.bootstrap.tooltip","ui.bootstrap.modal","ui.bootstrap.buttons","ui.bootstrap.transition","ui.bootstrap.tabs","ui.bootstrap.carousel","ui.bootstrap.popover","ui.bootstrap.alert","ui.bootstrap.accordion"]),angular.module("ui.bootstrap.tpls",["template/tooltip/tooltip-html-popup.html","template/tooltip/tooltip-html-unsafe-popup.html","template/tooltip/tooltip-popup.html","template/tooltip/tooltip-template-popup.html","template/modal/backdrop.html","template/modal/window.html","template/tabs/tab.html","template/tabs/tabset.html","template/carousel/carousel.html","template/carousel/slide.html","template/popover/popover-html.html","template/popover/popover-template.html","template/popover/popover.html","template/alert/alert.html","template/accordion/accordion-group.html","template/accordion/accordion.html"]),angular.module("ui.bootstrap.collapse",[]).directive("collapse",["$animate",function(e){return{link:function(t,n,o){function i(){n.removeClass("collapse").addClass("collapsing").attr("aria-expanded",!0).attr("aria-hidden",!1),e.addClass(n,"in",{to:{height:n[0].scrollHeight+"px"}}).then(a)}function a(){n.removeClass("collapsing"),n.css({height:"auto"})}function l(){return n.hasClass("collapse")||n.hasClass("in")?(n.css({height:n[0].scrollHeight+"px"}).removeClass("collapse").addClass("collapsing").attr("aria-expanded",!1).attr("aria-hidden",!0),void e.removeClass(n,"in",{to:{height:"0"}}).then(r)):r()}function r(){n.css({height:"0"}),n.removeClass("collapsing"),n.addClass("collapse")}t.$watch(o.collapse,function(e){e?l():i()})}}}]),angular.module("ui.bootstrap.bindHtml",[]).value("$bindHtmlUnsafeSuppressDeprecated",!1).directive("bindHtmlUnsafe",["$log","$bindHtmlUnsafeSuppressDeprecated",function(e,t){return function(n,o,i){t||e.warn("bindHtmlUnsafe is now deprecated. Use ngBindHtml instead"),o.addClass("ng-binding").data("$binding",i.bindHtmlUnsafe),n.$watch(i.bindHtmlUnsafe,function(e){o.html(e||"")})}}]),angular.module("ui.bootstrap.dropdown",["ui.bootstrap.position"]).constant("dropdownConfig",{openClass:"open"}).service("dropdownService",["$document","$rootScope",function(e,t){var n=null;this.open=function(t){n||(e.bind("click",o),e.bind("keydown",i)),n&&n!==t&&(n.isOpen=!1),n=t},this.close=function(t){n===t&&(n=null,e.unbind("click",o),e.unbind("keydown",i))};var o=function(e){if(n&&(!e||"disabled"!==n.getAutoClose())){var o=n.getToggleElement();if(!(e&&o&&o[0].contains(e.target))){var i=n.getDropdownElement();e&&"outsideClick"===n.getAutoClose()&&i&&i[0].contains(e.target)||(n.isOpen=!1,t.$$phase||n.$apply())}}},i=function(e){27===e.which?(n.focusToggleElement(),o()):n.isKeynavEnabled()&&/(38|40)/.test(e.which)&&n.isOpen&&(e.preventDefault(),e.stopPropagation(),n.focusDropdownEntry(e.which))}}]).controller("DropdownController",["$scope","$attrs","$parse","dropdownConfig","dropdownService","$animate","$position","$document","$compile","$templateRequest",function(e,t,n,o,i,a,l,r,s,c){var u,p,d=this,f=e.$new(),m=o.openClass,v=angular.noop,g=t.onToggle?n(t.onToggle):angular.noop,h=!1,$=!1,b=r.find("body");this.init=function(o){d.$element=o,t.isOpen&&(p=n(t.isOpen),v=p.assign,e.$watch(p,function(e){f.isOpen=!!e})),h=angular.isDefined(t.dropdownAppendToBody),$=angular.isDefined(t.keyboardNav),h&&d.dropdownMenu&&(b.append(d.dropdownMenu),b.addClass("dropdown"),o.on("$destroy",function(){d.dropdownMenu.remove()}))},this.toggle=function(e){return f.isOpen=arguments.length?!!e:!f.isOpen},this.isOpen=function(){return f.isOpen},f.getToggleElement=function(){return d.toggleElement},f.getAutoClose=function(){return t.autoClose||"always"},f.getElement=function(){return d.$element},f.isKeynavEnabled=function(){return $},f.focusDropdownEntry=function(e){var t=d.dropdownMenu?angular.element(d.dropdownMenu).find("a"):angular.element(d.$element).find("ul").eq(0).find("a");switch(e){case 40:d.selectedOption=angular.isNumber(d.selectedOption)?d.selectedOption===t.length-1?d.selectedOption:d.selectedOption+1:0;break;case 38:d.selectedOption=angular.isNumber(d.selectedOption)?0===d.selectedOption?0:d.selectedOption-1:t.length-1}t[d.selectedOption].focus()},f.getDropdownElement=function(){return d.dropdownMenu},f.focusToggleElement=function(){d.toggleElement&&d.toggleElement[0].focus()},f.$watch("isOpen",function(t,n){if(h&&d.dropdownMenu){var o=l.positionElements(d.$element,d.dropdownMenu,"bottom-left",!0),r={top:o.top+"px",display:t?"block":"none"},p=d.dropdownMenu.hasClass("dropdown-menu-right");p?(r.left="auto",r.right=window.innerWidth-(o.left+d.$element.prop("offsetWidth"))+"px"):(r.left=o.left+"px",r.right="auto"),d.dropdownMenu.css(r)}var $=h?b:d.$element;if(a[t?"addClass":"removeClass"]($,m).then(function(){angular.isDefined(t)&&t!==n&&g(e,{open:!!t})}),t)d.dropdownMenuTemplateUrl&&c(d.dropdownMenuTemplateUrl).then(function(e){u=f.$new(),s(e.trim())(u,function(e){var t=e;d.dropdownMenu.replaceWith(t),d.dropdownMenu=t})}),f.focusToggleElement(),i.open(f);else{if(d.dropdownMenuTemplateUrl){u&&u.$destroy();var C=angular.element('<ul class="dropdown-menu"></ul>');d.dropdownMenu.replaceWith(C),d.dropdownMenu=C}i.close(f),d.selectedOption=null}angular.isFunction(v)&&v(e,t)}),e.$on("$locationChangeSuccess",function(){"disabled"!==f.getAutoClose()&&(f.isOpen=!1)});var C=e.$on("$destroy",function(){f.$destroy()});f.$on("$destroy",C)}]).directive("dropdown",function(){return{controller:"DropdownController",link:function(e,t,n,o){o.init(t),t.addClass("dropdown")}}}).directive("dropdownMenu",function(){return{restrict:"AC",require:"?^dropdown",link:function(e,t,n,o){if(o){var i=n.templateUrl;i&&(o.dropdownMenuTemplateUrl=i),o.dropdownMenu||(o.dropdownMenu=t)}}}}).directive("keyboardNav",function(){return{restrict:"A",require:"?^dropdown",link:function(e,t,n,o){t.bind("keydown",function(e){if(-1!==[38,40].indexOf(e.which)){e.preventDefault(),e.stopPropagation();var t=o.dropdownMenu.find("a");switch(e.which){case 40:o.selectedOption=angular.isNumber(o.selectedOption)?o.selectedOption===t.length-1?o.selectedOption:o.selectedOption+1:0;break;case 38:o.selectedOption=angular.isNumber(o.selectedOption)?0===o.selectedOption?0:o.selectedOption-1:t.length-1}t[o.selectedOption].focus()}})}}}).directive("dropdownToggle",function(){return{require:"?^dropdown",link:function(e,t,n,o){if(o){t.addClass("dropdown-toggle"),o.toggleElement=t;var i=function(i){i.preventDefault(),t.hasClass("disabled")||n.disabled||e.$apply(function(){o.toggle()})};t.bind("click",i),t.attr({"aria-haspopup":!0,"aria-expanded":!1}),e.$watch(o.isOpen,function(e){t.attr("aria-expanded",!!e)}),e.$on("$destroy",function(){t.unbind("click",i)})}}}}),angular.module("ui.bootstrap.position",[]).factory("$position",["$document","$window",function(e,t){function n(e,n){return e.currentStyle?e.currentStyle[n]:t.getComputedStyle?t.getComputedStyle(e)[n]:e.style[n]}function o(e){return"static"===(n(e,"position")||"static")}var i=function(t){for(var n=e[0],i=t.offsetParent||n;i&&i!==n&&o(i);)i=i.offsetParent;return i||n};return{position:function(t){var n=this.offset(t),o={top:0,left:0},a=i(t[0]);a!=e[0]&&(o=this.offset(angular.element(a)),o.top+=a.clientTop-a.scrollTop,o.left+=a.clientLeft-a.scrollLeft);var l=t[0].getBoundingClientRect();return{width:l.width||t.prop("offsetWidth"),height:l.height||t.prop("offsetHeight"),top:n.top-o.top,left:n.left-o.left}},offset:function(n){var o=n[0].getBoundingClientRect();return{width:o.width||n.prop("offsetWidth"),height:o.height||n.prop("offsetHeight"),top:o.top+(t.pageYOffset||e[0].documentElement.scrollTop),left:o.left+(t.pageXOffset||e[0].documentElement.scrollLeft)}},positionElements:function(e,t,n,o){var i,a,l,r,s=n.split("-"),c=s[0],u=s[1]||"center";i=o?this.offset(e):this.position(e),a=t.prop("offsetWidth"),l=t.prop("offsetHeight");var p={center:function(){return i.left+i.width/2-a/2},left:function(){return i.left},right:function(){return i.left+i.width}},d={center:function(){return i.top+i.height/2-l/2},top:function(){return i.top},bottom:function(){return i.top+i.height}};switch(c){case"right":r={top:d[u](),left:p[c]()};break;case"left":r={top:d[u](),left:i.left-a};break;case"bottom":r={top:d[c](),left:p[u]()};break;default:r={top:i.top-l,left:p[u]()}}return r}}}]),angular.module("ui.bootstrap.tooltip",["ui.bootstrap.position","ui.bootstrap.bindHtml"]).provider("$tooltip",function(){function e(e){var t=/[A-Z]/g,n="-";return e.replace(t,function(e,t){return(t?n:"")+e.toLowerCase()})}var t={placement:"top",animation:!0,popupDelay:0,useContentExp:!1},n={mouseenter:"mouseleave",click:"click",focus:"blur",none:""},o={};this.options=function(e){angular.extend(o,e)},this.setTriggers=function(e){angular.extend(n,e)},this.$get=["$window","$compile","$timeout","$document","$position","$interpolate","$rootScope","$parse",function(i,a,l,r,s,c,u,p){return function(i,d,f,m){function v(e){var t=(e||m.trigger||f).split(" "),o=t.map(function(e){return n[e]||e});return{show:t,hide:o}}m=angular.extend({},t,o,m);var g=e(i),h=c.startSymbol(),$=c.endSymbol(),b="<div "+g+'-popup title="'+h+"title"+$+'" '+(m.useContentExp?'content-exp="contentExp()" ':'content="'+h+"content"+$+'" ')+'placement="'+h+"placement"+$+'" popup-class="'+h+"popupClass"+$+'" animation="animation" is-open="isOpen"origin-scope="origScope" ></div>';return{restrict:"EA",compile:function(){var e=a(b);return function(t,n,o){function a(){I.isOpen?f():c()}function c(){(!N||t.$eval(o[d+"Enable"]))&&(C(),I.popupDelay?S||(S=l(g,I.popupDelay,!1)):g())}function f(){h(),u.$$phase||u.$digest()}function g(){return S=null,T&&(l.cancel(T),T=null),(m.useContentExp?I.contentExp():I.content)?($(),I.isOpen=!0,H&&H.assign(I.origScope,I.isOpen),u.$$phase||I.$apply(),O.css({display:"block"}),void M()):angular.noop}function h(){I.isOpen=!1,H&&H.assign(I.origScope,I.isOpen),l.cancel(S),S=null,l.cancel(D),D=null,I.animation?T||(T=l(b,500)):b()}function $(){O&&b(),x=I.$new(),O=e(x,function(e){A?r.find("body").append(e):n.after(e)}),m.useContentExp&&(x.$watch("contentExp()",function(e){!e&&I.isOpen&&h()}),x.$watch(function(){q||(q=!0,x.$$postDigest(function(){q=!1,I.isOpen&&M()}))}))}function b(){T=null,O&&(O.remove(),O=null),x&&(x.$destroy(),x=null)}function C(){w(),k(),y()}function w(){I.popupClass=o[d+"Class"]}function k(){var e=o[d+"Placement"];I.placement=angular.isDefined(e)?e:m.placement}function y(){var e=o[d+"PopupDelay"],t=parseInt(e,10);I.popupDelay=isNaN(t)?m.popupDelay:t}function E(){var e=o[d+"Trigger"];F(),U=v(e),"none"!==U.show&&U.show.forEach(function(e,t){e===U.hide[t]?n[0].addEventListener(e,a):e&&(n[0].addEventListener(e,c),n[0].addEventListener(U.hide[t],f))})}var O,x,T,S,D,A=angular.isDefined(m.appendToBody)?m.appendToBody:!1,U=v(void 0),N=angular.isDefined(o[d+"Enable"]),I=t.$new(!0),q=!1,H=angular.isDefined(o[d+"IsOpen"])?p(o[d+"IsOpen"]):!1,M=function(){O&&(D||(D=l(function(){O.css({top:0,left:0,width:"auto",height:"auto"});var e=s.position(O),t=s.positionElements(n,O,I.placement,A);t.top+="px",t.left+="px",t.width=e.width+"px",t.height=e.height+"px",O.css(t),D=null},0,!1)))};I.origScope=t,I.isOpen=!1,I.contentExp=function(){return t.$eval(o[i])},m.useContentExp||o.$observe(i,function(e){I.content=e,!e&&I.isOpen?h():M()}),o.$observe("disabled",function(e){S&&e&&(l.cancel(S),S=null),e&&I.isOpen&&h()}),o.$observe(d+"Title",function(e){I.title=e,M()}),o.$observe(d+"Placement",function(){I.isOpen&&(k(),M())}),H&&t.$watch(H,function(e){e!==I.isOpen&&a()});var F=function(){U.show.forEach(function(e){n.unbind(e,c)}),U.hide.forEach(function(e){n.unbind(e,f)})};E();var L=t.$eval(o[d+"Animation"]);I.animation=angular.isDefined(L)?!!L:m.animation;var P=t.$eval(o[d+"AppendToBody"]);A=angular.isDefined(P)?P:A,A&&t.$on("$locationChangeSuccess",function(){I.isOpen&&h()}),t.$on("$destroy",function(){l.cancel(T),l.cancel(S),l.cancel(D),F(),b(),I=null})}}}}}]}).directive("tooltipTemplateTransclude",["$animate","$sce","$compile","$templateRequest",function(e,t,n,o){return{link:function(i,a,l){var r,s,c,u=i.$eval(l.tooltipTemplateTranscludeScope),p=0,d=function(){s&&(s.remove(),s=null),r&&(r.$destroy(),r=null),c&&(e.leave(c).then(function(){s=null}),s=c,c=null)};i.$watch(t.parseAsResourceUrl(l.tooltipTemplateTransclude),function(t){var l=++p;t?(o(t,!0).then(function(o){if(l===p){var i=u.$new(),s=o,f=n(s)(i,function(t){d(),e.enter(t,a)});r=i,c=f,r.$emit("$includeContentLoaded",t)}},function(){l===p&&(d(),i.$emit("$includeContentError",t))}),i.$emit("$includeContentRequested",t)):d()}),i.$on("$destroy",d)}}}]).directive("tooltipClasses",function(){return{restrict:"A",link:function(e,t,n){e.placement&&t.addClass(e.placement),e.popupClass&&t.addClass(e.popupClass),e.animation()&&t.addClass(n.tooltipAnimationClass)}}}).directive("tooltipPopup",function(){return{restrict:"EA",replace:!0,scope:{content:"@",placement:"@",popupClass:"@",animation:"&",isOpen:"&"},templateUrl:"template/tooltip/tooltip-popup.html"}}).directive("tooltip",["$tooltip",function(e){return e("tooltip","tooltip","mouseenter")}]).directive("tooltipTemplatePopup",function(){return{restrict:"EA",replace:!0,scope:{contentExp:"&",placement:"@",popupClass:"@",animation:"&",isOpen:"&",originScope:"&"},templateUrl:"template/tooltip/tooltip-template-popup.html"}}).directive("tooltipTemplate",["$tooltip",function(e){return e("tooltipTemplate","tooltip","mouseenter",{useContentExp:!0})}]).directive("tooltipHtmlPopup",function(){return{restrict:"EA",replace:!0,scope:{contentExp:"&",placement:"@",popupClass:"@",animation:"&",isOpen:"&"},templateUrl:"template/tooltip/tooltip-html-popup.html"}}).directive("tooltipHtml",["$tooltip",function(e){return e("tooltipHtml","tooltip","mouseenter",{useContentExp:!0})}]).directive("tooltipHtmlUnsafePopup",function(){return{restrict:"EA",replace:!0,scope:{content:"@",placement:"@",popupClass:"@",animation:"&",isOpen:"&"},templateUrl:"template/tooltip/tooltip-html-unsafe-popup.html"}}).value("tooltipHtmlUnsafeSuppressDeprecated",!1).directive("tooltipHtmlUnsafe",["$tooltip","tooltipHtmlUnsafeSuppressDeprecated","$log",function(e,t,n){return t||n.warn("tooltip-html-unsafe is now deprecated. Use tooltip-html or tooltip-template instead."),e("tooltipHtmlUnsafe","tooltip","mouseenter")}]),angular.module("ui.bootstrap.modal",[]).factory("$$stackedMap",function(){return{createNew:function(){var e=[];return{add:function(t,n){e.push({key:t,value:n})},get:function(t){for(var n=0;n<e.length;n++)if(t==e[n].key)return e[n]},keys:function(){for(var t=[],n=0;n<e.length;n++)t.push(e[n].key);return t},top:function(){return e[e.length-1]},remove:function(t){for(var n=-1,o=0;o<e.length;o++)if(t==e[o].key){n=o;break}return e.splice(n,1)[0]},removeTop:function(){return e.splice(e.length-1,1)[0]},length:function(){return e.length}}}}}).factory("$$multiMap",function(){return{createNew:function(){var e={};return{entries:function(){return Object.keys(e).map(function(t){return{key:t,value:e[t]}})},get:function(t){return e[t]},hasKey:function(t){return!!e[t]},keys:function(){return Object.keys(e)},put:function(t,n){e[t]||(e[t]=[]),e[t].push(n)},remove:function(t,n){var o=e[t];if(o){var i=o.indexOf(n);-1!==i&&o.splice(i,1),o.length||delete e[t]}}}}}}).directive("modalBackdrop",["$animate","$injector","$modalStack",function(e,t,n){function o(t,o,a){a.modalInClass&&(i?i(o,{addClass:a.modalInClass}).start():e.addClass(o,a.modalInClass),t.$on(n.NOW_CLOSING_EVENT,function(t,n){var l=n();i?i(o,{removeClass:a.modalInClass}).start().then(l):e.removeClass(o,a.modalInClass).then(l)}))}var i=null;return t.has("$animateCss")&&(i=t.get("$animateCss")),{restrict:"EA",replace:!0,templateUrl:"template/modal/backdrop.html",compile:function(e,t){return e.addClass(t.backdropClass),o}}}]).directive("modalWindow",["$modalStack","$q","$animate","$injector",function(e,t,n,o){var i=null;return o.has("$animateCss")&&(i=o.get("$animateCss")),{restrict:"EA",scope:{index:"@"},replace:!0,transclude:!0,templateUrl:function(e,t){return t.templateUrl||"template/modal/window.html"},link:function(o,a,l){a.addClass(l.windowClass||""),o.size=l.size,o.close=function(t){var n=e.getTop();n&&n.value.backdrop&&"static"!==n.value.backdrop&&t.target===t.currentTarget&&(t.preventDefault(),t.stopPropagation(),e.dismiss(n.key,"backdrop click"))},o.$isRendered=!0;var r=t.defer();l.$observe("modalRender",function(e){"true"==e&&r.resolve()}),r.promise.then(function(){var r=null;l.modalInClass&&(r=i?i(a,{addClass:l.modalInClass}).start():n.addClass(a,l.modalInClass),o.$on(e.NOW_CLOSING_EVENT,function(e,t){var o=t();i?i(a,{removeClass:l.modalInClass}).start().then(o):n.removeClass(a,l.modalInClass).then(o)})),t.when(r).then(function(){var e=a[0].querySelectorAll("[autofocus]");e.length?e[0].focus():a[0].focus()});var s=e.getTop();s&&e.modalRendered(s.key)})}}}]).directive("modalAnimationClass",[function(){return{compile:function(e,t){t.modalAnimation&&e.addClass(t.modalAnimationClass)}}}]).directive("modalTransclude",function(){return{link:function(e,t,n,o,i){i(e.$parent,function(e){t.empty(),t.append(e)})}}}).factory("$modalStack",["$animate","$timeout","$document","$compile","$rootScope","$q","$injector","$$multiMap","$$stackedMap",function(e,t,n,o,i,a,l,r,s){function c(){for(var e=-1,t=b.keys(),n=0;n<t.length;n++)b.get(t[n]).value.backdrop&&(e=n);return e}function u(e,t){var o=n.find("body").eq(0),i=b.get(e).value;b.remove(e),d(i.modalDomEl,i.modalScope,function(){var t=i.openedClass||$;C.remove(t,e),o.toggleClass(t,C.hasKey(t))}),p(),t&&t.focus?t.focus():o.focus()}function p(){if(v&&-1==c()){var e=g;d(v,g,function(){e=null}),v=void 0,g=void 0}}function d(t,n,o){function i(){i.done||(i.done=!0,m?m(t,{event:"leave"}).start().then(function(){t.remove()}):e.leave(t),n.$destroy(),o&&o())}var l,r=null,s=function(){return l||(l=a.defer(),r=l.promise),function(){l.resolve()}};return n.$broadcast(w.NOW_CLOSING_EVENT,s),a.when(r).then(i)}function f(e,t,n){return!e.value.modalScope.$broadcast("modal.closing",t,n).defaultPrevented}var m=null;l.has("$animateCss")&&(m=l.get("$animateCss"));var v,g,h,$="modal-open",b=s.createNew(),C=r.createNew(),w={NOW_CLOSING_EVENT:"modal.stack.now-closing"},k=0,y="a[href], area[href], input:not([disabled]), button:not([disabled]),select:not([disabled]), textarea:not([disabled]), iframe, object, embed, *[tabindex], *[contenteditable=true]";return i.$watch(c,function(e){g&&(g.index=e)}),n.bind("keydown",function(e){if(e.isDefaultPrevented())return e;var t=b.top();if(t&&t.value.keyboard)switch(e.which){case 27:e.preventDefault(),i.$apply(function(){w.dismiss(t.key,"escape key press")});break;case 9:w.loadFocusElementList(t);var n=!1;e.shiftKey?w.isFocusInFirstItem(e)&&(n=w.focusLastFocusableElement()):w.isFocusInLastItem(e)&&(n=w.focusFirstFocusableElement()),n&&(e.preventDefault(),e.stopPropagation())}}),w.open=function(e,t){var a=n[0].activeElement,l=t.openedClass||$;b.add(e,{deferred:t.deferred,renderDeferred:t.renderDeferred,modalScope:t.scope,backdrop:t.backdrop,keyboard:t.keyboard,openedClass:t.openedClass}),C.put(l,e);var r=n.find("body").eq(0),s=c();if(s>=0&&!v){g=i.$new(!0),g.index=s;var u=angular.element('<div modal-backdrop="modal-backdrop"></div>');u.attr("backdrop-class",t.backdropClass),t.animation&&u.attr("modal-animation","true"),v=o(u)(g),r.append(v)}var p=angular.element('<div modal-window="modal-window"></div>');p.attr({"template-url":t.windowTemplateUrl,"window-class":t.windowClass,size:t.size,index:b.length()-1,animate:"animate"}).html(t.content),t.animation&&p.attr("modal-animation","true");var d=o(p)(t.scope);b.top().value.modalDomEl=d,b.top().value.modalOpener=a,r.append(d),r.addClass(l),w.clearFocusListCache()},w.close=function(e,t){var n=b.get(e);return n&&f(n,t,!0)?(n.value.modalScope.$$uibDestructionScheduled=!0,n.value.deferred.resolve(t),u(e,n.value.modalOpener),!0):!n},w.dismiss=function(e,t){var n=b.get(e);return n&&f(n,t,!1)?(n.value.modalScope.$$uibDestructionScheduled=!0,n.value.deferred.reject(t),u(e,n.value.modalOpener),!0):!n},w.dismissAll=function(e){for(var t=this.getTop();t&&this.dismiss(t.key,e);)t=this.getTop()},w.getTop=function(){return b.top()},w.modalRendered=function(e){var t=b.get(e);t&&t.value.renderDeferred.resolve()},w.focusFirstFocusableElement=function(){return h.length>0?(h[0].focus(),!0):!1},w.focusLastFocusableElement=function(){return h.length>0?(h[h.length-1].focus(),!0):!1},w.isFocusInFirstItem=function(e){return h.length>0?(e.target||e.srcElement)==h[0]:!1},w.isFocusInLastItem=function(e){return h.length>0?(e.target||e.srcElement)==h[h.length-1]:!1},w.clearFocusListCache=function(){h=[],k=0},w.loadFocusElementList=function(e){if((void 0===h||!h.length0)&&e){var t=e.value.modalDomEl;t&&t.length&&(h=t[0].querySelectorAll(y))}},w}]).provider("$modal",function(){var e={options:{animation:!0,backdrop:!0,keyboard:!0},$get:["$injector","$rootScope","$q","$templateRequest","$controller","$modalStack",function(t,n,o,i,a,l){function r(e){return e.template?o.when(e.template):i(angular.isFunction(e.templateUrl)?e.templateUrl():e.templateUrl)}function s(e){var n=[];return angular.forEach(e,function(e){n.push(angular.isFunction(e)||angular.isArray(e)?o.when(t.invoke(e)):angular.isString(e)?o.when(t.get(e)):o.when(e))}),n}var c={},u=null;return c.getPromiseChain=function(){return u},c.open=function(t){var i=o.defer(),c=o.defer(),p=o.defer(),d={result:i.promise,opened:c.promise,rendered:p.promise,close:function(e){return l.close(d,e)},dismiss:function(e){return l.dismiss(d,e)}};if(t=angular.extend({},e.options,t),t.resolve=t.resolve||{},!t.template&&!t.templateUrl)throw new Error("One of template or templateUrl options is required.");var f,m=o.all([r(t)].concat(s(t.resolve)));return f=u=o.all([u]).then(function(){return m},function(){return m}).then(function(e){var o=(t.scope||n).$new();o.$close=d.close,o.$dismiss=d.dismiss,o.$on("$destroy",function(){o.$$uibDestructionScheduled||o.$dismiss("$uibUnscheduledDestruction")});var r,s={},u=1;t.controller&&(s.$scope=o,s.$modalInstance=d,angular.forEach(t.resolve,function(t,n){s[n]=e[u++]}),r=a(t.controller,s),t.controllerAs&&(t.bindToController&&angular.extend(r,o),o[t.controllerAs]=r)),l.open(d,{scope:o,deferred:i,renderDeferred:p,content:e[0],animation:t.animation,backdrop:t.backdrop,keyboard:t.keyboard,backdropClass:t.backdropClass,windowClass:t.windowClass,windowTemplateUrl:t.windowTemplateUrl,size:t.size,openedClass:t.openedClass}),c.resolve(!0)},function(e){c.reject(e),i.reject(e)}).finally(function(){u===f&&(u=null)}),d},c}]};return e}),angular.module("ui.bootstrap.buttons",[]).constant("buttonConfig",{activeClass:"active",toggleEvent:"click"}).controller("ButtonsController",["buttonConfig",function(e){this.activeClass=e.activeClass||"active",this.toggleEvent=e.toggleEvent||"click"}]).directive("btnRadio",function(){return{require:["btnRadio","ngModel"],controller:"ButtonsController",controllerAs:"buttons",link:function(e,t,n,o){var i=o[0],a=o[1];t.find("input").css({display:"none"}),a.$render=function(){t.toggleClass(i.activeClass,angular.equals(a.$modelValue,e.$eval(n.btnRadio)))},t.bind(i.toggleEvent,function(){if(!n.disabled){var o=t.hasClass(i.activeClass);(!o||angular.isDefined(n.uncheckable))&&e.$apply(function(){a.$setViewValue(o?null:e.$eval(n.btnRadio)),a.$render()})}})}}}).directive("btnCheckbox",["$document",function(e){return{require:["btnCheckbox","ngModel"],controller:"ButtonsController",controllerAs:"button",link:function(t,n,o,i){function a(){return r(o.btnCheckboxTrue,!0)}function l(){return r(o.btnCheckboxFalse,!1)}function r(e,n){var o=t.$eval(e);return angular.isDefined(o)?o:n}var s=i[0],c=i[1];n.find("input").css({display:"none"}),c.$render=function(){n.toggleClass(s.activeClass,angular.equals(c.$modelValue,a()))},n.bind(s.toggleEvent,function(){o.disabled||t.$apply(function(){c.$setViewValue(n.hasClass(s.activeClass)?l():a()),c.$render()})}),n.on("keypress",function(i){o.disabled||32!==i.which||e[0].activeElement!==n[0]||t.$apply(function(){c.$setViewValue(n.hasClass(s.activeClass)?l():a()),c.$render()})})}}}]),angular.module("ui.bootstrap.transition",[]).value("$transitionSuppressDeprecated",!1).factory("$transition",["$q","$timeout","$rootScope","$log","$transitionSuppressDeprecated",function(e,t,n,o,i){function a(e){for(var t in e)if(void 0!==r.style[t])return e[t]}i||o.warn("$transition is now deprecated. Use $animate from ngAnimate instead.");var l=function(o,i,a){a=a||{};var r=e.defer(),s=l[a.animation?"animationEndEventName":"transitionEndEventName"],c=function(){n.$apply(function(){o.unbind(s,c),r.resolve(o)})};return s&&o.bind(s,c),t(function(){angular.isString(i)?o.addClass(i):angular.isFunction(i)?i(o):angular.isObject(i)&&o.css(i),s||r.resolve(o)}),r.promise.cancel=function(){s&&o.unbind(s,c),r.reject("Transition cancelled")},r.promise},r=document.createElement("trans"),s={WebkitTransition:"webkitTransitionEnd",MozTransition:"transitionend",OTransition:"oTransitionEnd",transition:"transitionend"},c={WebkitTransition:"webkitAnimationEnd",MozTransition:"animationend",OTransition:"oAnimationEnd",transition:"animationend"};return l.transitionEndEventName=a(s),l.animationEndEventName=a(c),l}]),angular.module("ui.bootstrap.tabs",[]).controller("TabsetController",["$scope",function(e){var t=this,n=t.tabs=e.tabs=[];t.select=function(e){angular.forEach(n,function(t){t.active&&t!==e&&(t.active=!1,t.onDeselect(),e.selectCalled=!1)}),e.active=!0,e.selectCalled||(e.onSelect(),e.selectCalled=!0)},t.addTab=function(e){n.push(e),1===n.length&&e.active!==!1?e.active=!0:e.active?t.select(e):e.active=!1},t.removeTab=function(e){var i=n.indexOf(e);if(e.active&&n.length>1&&!o){var a=i==n.length-1?i-1:i+1;t.select(n[a])}n.splice(i,1)};var o;e.$on("$destroy",function(){o=!0})}]).directive("tabset",function(){return{restrict:"EA",transclude:!0,replace:!0,scope:{type:"@"},controller:"TabsetController",templateUrl:"template/tabs/tabset.html",link:function(e,t,n){e.vertical=angular.isDefined(n.vertical)?e.$parent.$eval(n.vertical):!1,e.justified=angular.isDefined(n.justified)?e.$parent.$eval(n.justified):!1}}}).directive("tab",["$parse","$log",function(e,t){return{require:"^tabset",restrict:"EA",replace:!0,templateUrl:"template/tabs/tab.html",transclude:!0,scope:{active:"=?",heading:"@",onSelect:"&select",onDeselect:"&deselect"},controller:function(){},link:function(n,o,i,a,l){n.$watch("active",function(e){e&&a.select(n)}),n.disabled=!1,i.disable&&n.$parent.$watch(e(i.disable),function(e){n.disabled=!!e}),i.disabled&&(t.warn('Use of "disabled" attribute has been deprecated, please use "disable"'),n.$parent.$watch(e(i.disabled),function(e){n.disabled=!!e})),n.select=function(){n.disabled||(n.active=!0)},a.addTab(n),n.$on("$destroy",function(){a.removeTab(n)}),n.$transcludeFn=l}}}]).directive("tabHeadingTransclude",function(){return{restrict:"A",require:"^tab",link:function(e,t){e.$watch("headingElement",function(e){e&&(t.html(""),t.append(e))})}}}).directive("tabContentTransclude",function(){function e(e){return e.tagName&&(e.hasAttribute("tab-heading")||e.hasAttribute("data-tab-heading")||e.hasAttribute("x-tab-heading")||"tab-heading"===e.tagName.toLowerCase()||"data-tab-heading"===e.tagName.toLowerCase()||"x-tab-heading"===e.tagName.toLowerCase())}return{restrict:"A",require:"^tabset",link:function(t,n,o){var i=t.$eval(o.tabContentTransclude);i.$transcludeFn(i.$parent,function(t){angular.forEach(t,function(t){e(t)?i.headingElement=t:n.append(t)})})}}}),angular.module("ui.bootstrap.carousel",[]).controller("CarouselController",["$scope","$element","$interval","$animate",function(e,t,n,o){function i(t,n,i){h||(angular.extend(t,{direction:i,active:!0}),angular.extend(p.currentSlide||{},{direction:i,active:!1}),o.enabled()&&!e.noTransition&&!e.$currentTransition&&t.$element&&p.slides.length>1&&(t.$element.data(v,t.direction),p.currentSlide&&p.currentSlide.$element&&p.currentSlide.$element.data(v,t.direction),e.$currentTransition=!0,f?o.on("addClass",t.$element,function(t,n){"close"===n&&(e.$currentTransition=null,o.off("addClass",t))}):t.$element.one("$animate:close",function(){e.$currentTransition=null})),p.currentSlide=t,g=n,l())}function a(e){if(angular.isUndefined(d[e].index))return d[e];{var t;d.length}for(t=0;t<d.length;++t)if(d[t].index==e)return d[t]}function l(){r();var t=+e.interval;!isNaN(t)&&t>0&&(c=n(s,t))}function r(){c&&(n.cancel(c),c=null)}function s(){var t=+e.interval;u&&!isNaN(t)&&t>0&&d.length?e.next():e.pause()}var c,u,p=this,d=p.slides=e.slides=[],f=angular.version.minor>=4,m="uib-noTransition",v="uib-slideDirection",g=-1;p.currentSlide=null;var h=!1;p.select=e.select=function(t,n){var o=e.indexOfSlide(t);void 0===n&&(n=o>p.getCurrentIndex()?"next":"prev"),t&&t!==p.currentSlide&&!e.$currentTransition&&i(t,o,n)},e.$on("$destroy",function(){h=!0}),p.getCurrentIndex=function(){return p.currentSlide&&angular.isDefined(p.currentSlide.index)?+p.currentSlide.index:g},e.indexOfSlide=function(e){return angular.isDefined(e.index)?+e.index:d.indexOf(e)},e.next=function(){var t=(p.getCurrentIndex()+1)%d.length;return 0===t&&e.noWrap()?void e.pause():p.select(a(t),"next")},e.prev=function(){var t=p.getCurrentIndex()-1<0?d.length-1:p.getCurrentIndex()-1;return e.noWrap()&&t===d.length-1?void e.pause():p.select(a(t),"prev")},e.isActive=function(e){return p.currentSlide===e},e.$watch("interval",l),e.$on("$destroy",r),e.play=function(){u||(u=!0,l())},e.pause=function(){e.noPause||(u=!1,r())},p.addSlide=function(t,n){t.$element=n,d.push(t),1===d.length||t.active?(p.select(d[d.length-1]),1==d.length&&e.play()):t.active=!1},p.removeSlide=function(e){angular.isDefined(e.index)&&d.sort(function(e,t){return+e.index>+t.index});var t=d.indexOf(e);d.splice(t,1),d.length>0&&e.active?p.select(t>=d.length?d[t-1]:d[t]):g>t&&g--,0===d.length&&(p.currentSlide=null)},e.$watch("noTransition",function(e){t.data(m,e)})}]).directive("carousel",[function(){return{restrict:"EA",transclude:!0,replace:!0,controller:"CarouselController",controllerAs:"carousel",require:"carousel",templateUrl:function(e,t){return t.templateUrl||"template/carousel/carousel.html"},scope:{interval:"=",noTransition:"=",noPause:"=",noWrap:"&"}}}]).directive("slide",function(){return{require:"^carousel",restrict:"EA",transclude:!0,replace:!0,templateUrl:function(e,t){return t.templateUrl||"template/carousel/slide.html"},scope:{active:"=?",actual:"=?",index:"=?"},link:function(e,t,n,o){o.addSlide(e,t),e.$on("$destroy",function(){o.removeSlide(e)}),e.$watch("active",function(t){t&&o.select(e)})}}}).animation(".item",["$injector","$animate",function(e,t){function n(e,t,n){e.removeClass(t),n&&n()}var o="uib-noTransition",i="uib-slideDirection",a=null;return e.has("$animateCss")&&(a=e.get("$animateCss")),{beforeAddClass:function(e,l,r){if("active"==l&&e.parent()&&!e.parent().data(o)){var s=!1,c=e.data(i),u="next"==c?"left":"right",p=n.bind(this,e,u+" "+c,r);return e.addClass(c),a?a(e,{addClass:u}).start().done(p):t.addClass(e,u).then(function(){s||p(),r()}),function(){s=!0}}r()},beforeRemoveClass:function(e,l,r){if("active"===l&&e.parent()&&!e.parent().data(o)){var s=!1,c=e.data(i),u="next"==c?"left":"right",p=n.bind(this,e,u,r);return a?a(e,{addClass:u}).start().done(p):t.addClass(e,u).then(function(){s||p(),r()}),function(){s=!0}}r()}}}]),angular.module("ui.bootstrap.popover",["ui.bootstrap.tooltip"]).directive("popoverTemplatePopup",function(){return{restrict:"EA",replace:!0,scope:{title:"@",contentExp:"&",placement:"@",popupClass:"@",animation:"&",isOpen:"&",originScope:"&"},templateUrl:"template/popover/popover-template.html"}}).directive("popoverTemplate",["$tooltip",function(e){return e("popoverTemplate","popover","click",{useContentExp:!0})}]).directive("popoverHtmlPopup",function(){return{restrict:"EA",replace:!0,scope:{contentExp:"&",title:"@",placement:"@",popupClass:"@",animation:"&",isOpen:"&"},templateUrl:"template/popover/popover-html.html"}}).directive("popoverHtml",["$tooltip",function(e){return e("popoverHtml","popover","click",{useContentExp:!0})
}]).directive("popoverPopup",function(){return{restrict:"EA",replace:!0,scope:{title:"@",content:"@",placement:"@",popupClass:"@",animation:"&",isOpen:"&"},templateUrl:"template/popover/popover.html"}}).directive("popover",["$tooltip",function(e){return e("popover","popover","click")}]),angular.module("ui.bootstrap.alert",[]).controller("AlertController",["$scope","$attrs",function(e,t){e.closeable=!!t.close,this.close=e.close}]).directive("alert",function(){return{controller:"AlertController",controllerAs:"alert",templateUrl:function(e,t){return t.templateUrl||"template/alert/alert.html"},transclude:!0,replace:!0,scope:{type:"@",close:"&"}}}).directive("dismissOnTimeout",["$timeout",function(e){return{require:"alert",link:function(t,n,o,i){e(function(){i.close()},parseInt(o.dismissOnTimeout,10))}}}]),angular.module("ui.bootstrap.accordion",["ui.bootstrap.collapse"]).constant("accordionConfig",{closeOthers:!0}).controller("AccordionController",["$scope","$attrs","accordionConfig",function(e,t,n){this.groups=[],this.closeOthers=function(o){var i=angular.isDefined(t.closeOthers)?e.$eval(t.closeOthers):n.closeOthers;i&&angular.forEach(this.groups,function(e){e!==o&&(e.isOpen=!1)})},this.addGroup=function(e){var t=this;this.groups.push(e),e.$on("$destroy",function(){t.removeGroup(e)})},this.removeGroup=function(e){var t=this.groups.indexOf(e);-1!==t&&this.groups.splice(t,1)}}]).directive("accordion",function(){return{restrict:"EA",controller:"AccordionController",controllerAs:"accordion",transclude:!0,replace:!1,templateUrl:function(e,t){return t.templateUrl||"template/accordion/accordion.html"}}}).directive("accordionGroup",function(){return{require:"^accordion",restrict:"EA",transclude:!0,replace:!0,templateUrl:function(e,t){return t.templateUrl||"template/accordion/accordion-group.html"},scope:{heading:"@",isOpen:"=?",isDisabled:"=?"},controller:function(){this.setHeading=function(e){this.heading=e}},link:function(e,t,n,o){o.addGroup(e),e.openClass=n.openClass||"panel-open",e.panelClass=n.panelClass,e.$watch("isOpen",function(n){t.toggleClass(e.openClass,n),n&&o.closeOthers(e)}),e.toggleOpen=function(t){e.isDisabled||t&&32!==t.which||(e.isOpen=!e.isOpen)}}}}).directive("accordionHeading",function(){return{restrict:"EA",transclude:!0,template:"",replace:!0,require:"^accordionGroup",link:function(e,t,n,o,i){o.setHeading(i(e,angular.noop))}}}).directive("accordionTransclude",function(){return{require:"^accordionGroup",link:function(e,t,n,o){e.$watch(function(){return o[n.accordionTransclude]},function(e){e&&(t.find("span").html(""),t.find("span").append(e))})}}}),angular.module("template/tooltip/tooltip-html-popup.html",[]).run(["$templateCache",function(e){e.put("template/tooltip/tooltip-html-popup.html",'<div class="tooltip"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="tooltip-arrow"></div>\n  <div class="tooltip-inner" ng-bind-html="contentExp()"></div>\n</div>\n')}]),angular.module("template/tooltip/tooltip-html-unsafe-popup.html",[]).run(["$templateCache",function(e){e.put("template/tooltip/tooltip-html-unsafe-popup.html",'<div class="tooltip"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="tooltip-arrow"></div>\n  <div class="tooltip-inner" bind-html-unsafe="content"></div>\n</div>\n')}]),angular.module("template/tooltip/tooltip-popup.html",[]).run(["$templateCache",function(e){e.put("template/tooltip/tooltip-popup.html",'<div class="tooltip"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="tooltip-arrow"></div>\n  <div class="tooltip-inner" ng-bind="content"></div>\n</div>\n')}]),angular.module("template/tooltip/tooltip-template-popup.html",[]).run(["$templateCache",function(e){e.put("template/tooltip/tooltip-template-popup.html",'<div class="tooltip"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="tooltip-arrow"></div>\n  <div class="tooltip-inner"\n    tooltip-template-transclude="contentExp()"\n    tooltip-template-transclude-scope="originScope()"></div>\n</div>\n')}]),angular.module("template/modal/backdrop.html",[]).run(["$templateCache",function(e){e.put("template/modal/backdrop.html",'<div class="modal-backdrop"\n     modal-animation-class="fade"\n     modal-in-class="in"\n     ng-style="{\'z-index\': 1040 + (index && 1 || 0) + index*10}"\n></div>\n')}]),angular.module("template/modal/window.html",[]).run(["$templateCache",function(e){e.put("template/modal/window.html",'<div modal-render="{{$isRendered}}" tabindex="-1" role="dialog" class="modal"\n    modal-animation-class="fade"\n    modal-in-class="in"\n	ng-style="{\'z-index\': 1050 + index*10, display: \'block\'}" ng-click="close($event)">\n    <div class="modal-dialog" ng-class="size ? \'modal-\' + size : \'\'"><div class="modal-content" modal-transclude></div></div>\n</div>\n')}]),angular.module("template/tabs/tab.html",[]).run(["$templateCache",function(e){e.put("template/tabs/tab.html",'<li ng-class="{active: active, disabled: disabled}">\n  <a href ng-click="select()" tab-heading-transclude>{{heading}}</a>\n</li>\n')}]),angular.module("template/tabs/tabset.html",[]).run(["$templateCache",function(e){e.put("template/tabs/tabset.html",'<div>\n  <ul class="nav nav-{{type || \'tabs\'}}" ng-class="{\'nav-stacked\': vertical, \'nav-justified\': justified}" ng-transclude></ul>\n  <div class="tab-content">\n    <div class="tab-pane" \n         ng-repeat="tab in tabs" \n         ng-class="{active: tab.active}"\n         tab-content-transclude="tab">\n    </div>\n  </div>\n</div>\n')}]),angular.module("template/carousel/carousel.html",[]).run(["$templateCache",function(e){e.put("template/carousel/carousel.html",'<div ng-mouseenter="pause()" ng-mouseleave="play()" class="carousel" ng-swipe-right="prev()" ng-swipe-left="next()">\n    <ol class="carousel-indicators" ng-show="slides.length > 1">\n        <li ng-repeat="slide in slides | orderBy:indexOfSlide track by $index" ng-class="{active: isActive(slide)}" ng-click="select(slide)"></li>\n    </ol>\n    <div class="carousel-inner" ng-transclude></div>\n    <a class="left carousel-control" ng-click="prev()" ng-show="slides.length > 1"><span class="glyphicon glyphicon-chevron-left"></span></a>\n    <a class="right carousel-control" ng-click="next()" ng-show="slides.length > 1"><span class="glyphicon glyphicon-chevron-right"></span></a>\n</div>\n')}]),angular.module("template/carousel/slide.html",[]).run(["$templateCache",function(e){e.put("template/carousel/slide.html",'<div ng-class="{\n    \'active\': active\n  }" class="item text-center" ng-transclude></div>\n')}]),angular.module("template/popover/popover-html.html",[]).run(["$templateCache",function(e){e.put("template/popover/popover-html.html",'<div class="popover"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="arrow"></div>\n\n  <div class="popover-inner">\n      <h3 class="popover-title" ng-bind="title" ng-if="title"></h3>\n      <div class="popover-content" ng-bind-html="contentExp()"></div>\n  </div>\n</div>\n')}]),angular.module("template/popover/popover-template.html",[]).run(["$templateCache",function(e){e.put("template/popover/popover-template.html",'<div class="popover"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="arrow"></div>\n\n  <div class="popover-inner">\n      <h3 class="popover-title" ng-bind="title" ng-if="title"></h3>\n      <div class="popover-content"\n        tooltip-template-transclude="contentExp()"\n        tooltip-template-transclude-scope="originScope()"></div>\n  </div>\n</div>\n')}]),angular.module("template/popover/popover.html",[]).run(["$templateCache",function(e){e.put("template/popover/popover.html",'<div class="popover"\n  tooltip-animation-class="fade"\n  tooltip-classes\n  ng-class="{ in: isOpen() }">\n  <div class="arrow"></div>\n\n  <div class="popover-inner">\n      <h3 class="popover-title" ng-bind="title" ng-if="title"></h3>\n      <div class="popover-content" ng-bind="content"></div>\n  </div>\n</div>\n')}]),angular.module("template/alert/alert.html",[]).run(["$templateCache",function(e){e.put("template/alert/alert.html",'<div class="alert" ng-class="[\'alert-\' + (type || \'warning\'), closeable ? \'alert-dismissible\' : null]" role="alert">\n    <button ng-show="closeable" type="button" class="close" ng-click="close($event)">\n        <span aria-hidden="true">&times;</span>\n        <span class="sr-only">Close</span>\n    </button>\n    <div ng-transclude></div>\n</div>\n')}]),angular.module("template/accordion/accordion-group.html",[]).run(["$templateCache",function(e){e.put("template/accordion/accordion-group.html",'<div class="panel {{panelClass || \'panel-default\'}}">\n  <div class="panel-heading" ng-keypress="toggleOpen($event)">\n    <h4 class="panel-title">\n      <a href tabindex="0" class="accordion-toggle" ng-click="toggleOpen()" accordion-transclude="heading"><span ng-class="{\'text-muted\': isDisabled}">{{heading}}</span></a>\n    </h4>\n  </div>\n  <div class="panel-collapse collapse" collapse="!isOpen">\n	  <div class="panel-body" ng-transclude></div>\n  </div>\n</div>\n')}]),angular.module("template/accordion/accordion.html",[]).run(["$templateCache",function(e){e.put("template/accordion/accordion.html",'<div class="panel-group" ng-transclude></div>')}]),!angular.$$csp()&&angular.element(document).find("head").prepend('<style type="text/css">.ng-animate.item:not(.left):not(.right){-webkit-transition:0s ease-in-out left;transition:0s ease-in-out left}</style>');;
/**
 * Author: ksankaran (Velu)
 * Date: 11/26/13
 * Time: 12:21 PM
 * Comments:
 */

twc.shared.apps.factory('CmsAModelClass',['RecordModel',function(RecordModel){
  return RecordModel.extend({
    recordType: 'a',

    /**
     * The response is simple and without header. So, set the response as data.
     * @param response
     */
    setResponse : function( response ) {
      this.data = response;
      this.header = "NA";
    },

    /**
     * Get asset id
     *
     * @returns {String}
     */
    getId: function() {
      return this._get('id');
    },

    /**
     * Get asset type
     *
     * @returns {String}
     */
    getType: function() {
      return this._get('type');
    },

    getHasWxNodeVideo: function() {
      return this._get('wxnodes')  && this._get('wxnodes').some(function(e) { return e.type === 'wxnode_video';});
    },

    /**
     * Get asset title
     *
     * @returns {String}
     */
    getTitle: function(teaserFlag) {
      return (teaserFlag && this._get('teaserTitle')) || this._get('title');
    },

    /**
     * Set asset title override
     *
     * @param overrideTitle
     */
    setTitle: function(overrideTitle) {
      if(overrideTitle) {
        this.set({"title": overrideTitle});
      }
    },

    /**
     * Add playlist to the end of URL
     * @param playlist
     */
    setPlaylistUrl: function(playlist) {
      var url = this._get("url");
      if(playlist && url && url.indexOf("pl=") === -1) {
        var hasQuestionMark = url.indexOf("?") !== -1;
        this.set({"playlisturl": url + (hasQuestionMark ? "&" : "?") + "pl=" + playlist});
      }
    },

    /**
     * Get url for media module based on various conditions.
     * Well, various for now is: playlisturl or url.
     */
    getMediaUrl : function() {
      return (this._get("playlisturl") || this._get("url"));
    },

    /**
     * Get URL of the asset.
     *
     * @note Other models contain this method, so this one should as well.
     * @returns {*}
     */
    getAssetUrl: function() {
      // ID of 12 was selected due to its most popular use.
      return this.getVariant(12);
    },

    /**
     * Get sub-assets
     *
     * @returns {String}
     */
    getAssets: function() {
      return this._get('assets');
    },

    /**
     * Get asset's primary collection id.
     *
     * @returns {String}
     */
    getPrimaryCollectionId : function() {
      return this._get('pcollid');
    },

    /**
     * Get asset's duration (for video).
     *
     * @returns {String}
     */
    getDuration : function() {
      return this._get('duration');
    },

    /**
     * Get asset's seo URL
     *
     * @returns {String}
     */
    getSEOUrl : function() {
      return this._get('seourl');
    },

    /**
     * Get asset's description
     *
     * @returns {String}
     */
    getDescription : function() {
      return this._get('description');
    },

    /**
     * Get asset's publish date. Eg: "2013-06-25T06:28:16-04:00"
     *
     * @returns {String}
     */
    getPublishDate : function() {
      return this._get('publishdate');
    },

    /**
     * Get video created date
     * @return {String}
     */
    getCreatedDate : function() {
        return this._get('createddate');
    },

    /**
     * Get asset's last modified date
     * @return {String}
     */
    getLastModifiedDate : function() {
        return this._get('lastmodifieddate');
    },

    /**
     * Get asset's source date. Eg: "2013-06-25T06:28:16-04:00"
     *
     * @returns {String}
     */
    getSourceDate : function() {
      return this._get('sourcedate');
    },

    /**
     * Get asset's tags. Tags have multiple sub nodes. Example below:
     *  tags: {
     *      geo: [
     *        "city:Providence",
     *        "DMA:US.521:US",
     *        "state:US.RI:US",
     *        "9reg:US.ne:US",
     *        "4reg:US.ne:US"
     *      ],
     *      keyword: [
     *        "lightning"
     *      ],
     *      loc: "USRI0050:1:US",
     *      wx: {
     *        hi: "91",
     *        low: "69",
     *        t: "Partly Cloudy",
     *        icon: "30"
     *      }
     *  }
     *
     * @returns {String}
     */
    getTags : function() {
      return this._get('tags');
    },

    /**
     *
     * Returns Object with list of flags that authorize usage in different domains
     * @returns {Object}
     */
    getFlags: function() {
     return this._get('flags');
    },

    /**
     * Get collections to which the asset belongs to.
     *
     * @returns {Array}
     */
    getCollections : function() {
      return this._get('colls');
    },

    /**
     * Get variants for this asset.
     *
     * @returns {Object}
     */
    getVariants : function() {
      return this._get('variants');
    },

    /**
     * Get a particular variant for this asset.
     *
     * @returns {Object}
     */
    getVariant : function(variant) {
      var variants = this._get('variants');
      return variants ? variants[variant] : null;
    },

    /**
     * Returns the url to the ttml-xml for closed captioning
     */
    getCCUrl: function() {
      return this._get('cc_url');
    },

    /**
     * Get provider id for the asset.
     *
     * @returns {String}
     */
    getProviderId : function() {
      return this._get('providerid');
    },

    /**
     * Get provider name for the asset.
     *
     * @returns {String}
     */
    getProviderName : function() {
      return this._get('providername');
    },

    /**
     * Get trimmed provider name for the asset.
     *
     * @returns {String}
     */
    getTrimmedProviderName : function() {
      return this._get('providername') ? this._get('providername').split(" ")[0] : "";
    },

    getMarketId : function() {
      return this._get('marketid');
    },

    /**
     * Get vendor id for the asset.
     *
     * @returns {String}
     */
    getVendorId : function() {
      return this._get('vendorid');
    },

    /**
     * Get a
     * @returns {*}
     */
    getSource : function() {
      var source = this._get('flags') && this._get('flags').orig_source;
      return (source ? source : "");
    },

    /**
     * Get Total assets. This is not available for all assets but for few like slideshow.
     * @returns {*}
     */
    getTotalAssets : function() {
      return this._get('totalAssets');
    },

    /**
     * Temp stub till we actually have credit.
     * @returns {*}
     */
    getCredit : function() {
      return this._get('credit');
    },

    /**
     * Get the credit fo the slideshow image.
     * Slideshow is using sourcename and now credit.
     * @returns {*}
     */
    getSourceName : function() {
      return this._get('sourcename');
    },

    /**
     * Gets asset's source as to where it came from: mmclip, mpx etc.
     * @returns {*}
     */
    getSourceName2: function() {
      return this._get('source_name');
    },

    /**
     * Get URL of the asset.
     *
     * @returns {*}
     */
    getUrl: function() {
      return this._get('url');
    },

    /**
     * Get asset collection data
     *
     * @returns {String}
     */
    getCollectionData : function() {
      var colldata = this._get("_collectiondata") || {};
      return  {
        getId: function() {
            return colldata.id;
        },
        getAdMetrics: function() {
          return colldata.ad_metrics;
        },
        getSponsored: function() {
          return colldata.sponsored;
        },
        getBackgroundImage: function() {
          return colldata.background_image;
        },
        getVideoBackgroundImage: function() {
          return colldata.background_image && colldata.background_image.video || null;
        },
        getArticleImage: function() {
          return colldata.background_image && colldata.background_image.article || null;
        },
        getTitleImage: function() {
          return colldata.background_image && colldata.background_image.title || null;
        },
        getUrl: function() {
          return colldata.url;
        },
        getTitle: function() {
          return colldata.title;
        }
      };
    },
    /**
     * Get asset author
     *
     * @returns {String}
     */
    getAuthors : function() {
        return this._get('author');
    },
    /**
     * Get playlist data
     *
     * @returns {String}
     */
    getPlaylistData : function() {
        var pldata = this._get('_pldata') || {};
        return {
            getUrl: function() {
                return pldata.url;
            },
            getTitle: function() {
                return pldata.title;
            }
        };
    },
    getAuthRequired: function() {
      return this._get('auth_required');
    }

  });
}]);
twc.shared.apps.factory('UGCAssetModelClass',['CmsAModelClass',function(CmsAModelClass){
    return CmsAModelClass.extend({
        recordType: 'ugc',

        /**
         * Get a particular variant for this asset.
         *
         * @returns {Object}
         */
        getVariant : function(variant) {
          var result = (this._get('variants') || [])[variant];
          // HACK: We will remove those code below after fixing dsx request.
          return result && result.replace('http:', 'https:').replace('https://utst.imwx.com', 'https://s.w-x.co/ugc').replace('https://ugc.aws-digital-prod-web.s3-website-us-east-1.amazonaws.com', 'https://s.w-x.co/ugc');
        },
        /**
         * Get alt asset title
         *
         * @returns {String}
         */
        getAltTitle: function() {
            return this._get('title');
        },

        /**
         * Get URL of the asset.
         *
         * @returns {*}
         */
        getAssetUrl: function() {
            return this.getVariant("stream");
        },

        /**
         * Get canonical URL where you can view the asset on website
         *
         * @returns {String}
         */
        getCanonicalUrl : function() {
            return this._get('seourl');
        },

        /**
         * Get asset's thumb URL, do I need this
         *
         * @returns {String}
         */
        getLargeThumbUrl : function() {
            return this.getVariant(12);
        },

        getProviderId: function() {
          return this._get('providerid');
        },

        getPublishDate: function() {
          return this._get('publishdate');
        },

      /**
       * Get asset collection data
       *
       * @returns {String}
       */
      getCollectionData : function() {
        var colldata = this._get("_collectiondata") || {};
        return  {
          getId: function() {
            return colldata.groupid;
          },
          getAdMetrics: function() {
            return colldata.ad_metrics;
          },
          getSponsored: function() {
            return colldata.sponsored;
          },
          getBackgroundImage: function() {
            return colldata.background_image;
          },
          getVideoBackgroundImage: function() {
            return colldata.background_image && colldata.background_image.video || null;
          },
          getArticleImage: function() {
            return colldata.background_image && colldata.background_image.article || null;
          },
          getTitleImage: function() {
            return colldata.background_image && colldata.background_image.title || null;
          },
          getUrl: function() {
            return colldata.url;
          },
          getTitle: function() {
            return colldata.title;
          }
        };
      }

    });
}]);
twc.shared.apps.factory('VideoAssetModelClass',['CmsAModelClass',function(CmsAModelClass){
    return CmsAModelClass.extend({
        recordType: 'video',

        /**
         * Get alt asset title
         *
         * @returns {String}
         */
        getAltTitle: function() {
            return this._get('altitle');
        },

        /**
         * Get the video description.
         *
         * @returns {String}
         */
        getVideoDescription: function() {
          return this._get('description');
        },

        /**
         * Get URL of the asset.
         *
         * @returns {*}
         */
        // TODO: THIS SHOULD BE UNDER VARIANTS {STREAM: 'VIDEOURL'}
        getAssetUrl: function() {
            return this._get("mezzanine_url");
        },

        /**
         * Get canonical URL where you can view the asset on website
         *
         * @returns {String}
         */
        getCanonicalUrl : function() {
            return this._get('url');
        },

        /**
         * Get asset's thumb URL, do I need this
         *
         * @returns {String}
         */
        getLargeThumbUrl : function() {
            return this.getVariant(200);
        },


        /**
         * Index of asset item
         *
         * @returns {String}
         */
        getItemIndex : function() {
          return this._get("itemIndex");
        },

        /**
         * Setter method for item index
         * @param idx
         */
        setItemIndex : function(idx) {
          this.set({"itemIndex": idx});
        }
    });
}]);
;
