/* global angular */
angular.module('campusHelpdesk', ['ngRoute'])
  .factory('UiFeedback', function ($rootScope, $timeout) {
    function clear() {
      $rootScope.globalError = null;
      $rootScope.globalSuccess = null;
    }

    function setError(message) {
      clear();
      $rootScope.globalError = message;
    }

    function setSuccess(message) {
      clear();
      $rootScope.globalSuccess = message;
      $timeout(function () {
        if ($rootScope.globalSuccess === message) {
          $rootScope.globalSuccess = null;
        }
      }, 2500);
    }

    return {
      clear: clear,
      setError: setError,
      setSuccess: setSuccess,
    };
  })
  .factory('ApiResponse', function () {
    function unwrap(resp) {
      if (!resp || !resp.data) return {};
      return resp.data.data !== undefined ? resp.data.data : resp.data;
    }
    return { unwrap: unwrap };
  })
  .config(function ($routeProvider) {
    $routeProvider
      .when('/login', {
        templateUrl: 'views/login.html',
        controller: 'AuthController',
        controllerAs: 'auth',
        requireAuth: false,
      })
      .when('/signup', {
        templateUrl: 'views/signup.html',
        controller: 'AuthController',
        controllerAs: 'auth',
        requireAuth: false,
      })
      .when('/dashboard', {
        templateUrl: 'views/dashboard.html',
        controller: 'DashboardController',
        controllerAs: 'dash',
        requireAuth: true,
      })
      .when('/complaints', {
        templateUrl: 'views/complaints.html',
        controller: 'ComplaintsController',
        controllerAs: 'complaints',
        requireAuth: true,
      })
      .when('/lost-items', {
        templateUrl: 'views/lost-items.html',
        controller: 'LostItemsController',
        controllerAs: 'lost',
        requireAuth: true,
      })
      .when('/found-items', {
        templateUrl: 'views/found-items.html',
        controller: 'FoundItemsController',
        controllerAs: 'found',
        requireAuth: true,
      })
      .when('/claims', {
        templateUrl: 'views/claims.html',
        controller: 'ClaimsController',
        controllerAs: 'claims',
        requireAuth: true,
      })
      .when('/profile', {
        templateUrl: 'views/profile.html',
        controller: 'ProfileController',
        controllerAs: 'profile',
        requireAuth: true,
      })
      .when('/admin-dashboard', {
        templateUrl: 'views/admin-dashboard.html',
        controller: 'AdminDashboardController',
        controllerAs: 'adminDash',
        requireAuth: true,
      })
      .otherwise({
        redirectTo: '/dashboard',
      });
  })
  .run(function ($rootScope, $location, TokenService) {
    $rootScope.$on('$routeChangeStart', function (event, next) {
      if (!next || !next.$$route) return;

      var requireAuth = !!next.$$route.requireAuth;
      var token = TokenService.getToken();
      if (requireAuth && !token) {
        $location.path('/login');
      }
    });
  })
  .factory('TokenService', function () {
    var key = 'campus_helpdesk_token';
    return {
      getToken: function () {
        return localStorage.getItem(key);
      },
      setToken: function (token) {
        localStorage.setItem(key, token);
      },
      clear: function () {
        localStorage.removeItem(key);
      },
    };
  })
  .factory('ThemeService', function () {
    var key = 'campus_helpdesk_theme';

    return {
      getTheme: function () {
        return localStorage.getItem(key) || 'light';
      },
      setTheme: function (theme) {
        localStorage.setItem(key, theme);
      },
      toggleTheme: function (currentTheme) {
        var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(key, nextTheme);
        return nextTheme;
      },
    };
  })
  .factory('JwtService', function () {
    function safeBase64Decode(str) {
      // JWT uses base64url encoding.
      var output = str.replace(/-/g, '+').replace(/_/g, '/');
      return atob(output);
    }

    return {
      decode: function (token) {
        if (!token) return null;
        var parts = token.split('.');
        if (parts.length < 2) return null;
        try {
          return JSON.parse(safeBase64Decode(parts[1]));
        } catch (e) {
          return null;
        }
      },
    };
  })
  .factory('Api', function ($http, TokenService, $rootScope) {
    var apiBase = '/api';

    function authHeaders() {
      var token = TokenService.getToken();
      return token ? { Authorization: 'Bearer ' + token } : {};
    }

    function handleError(err) {
      if (err && err.status === 401) {
        $rootScope.$broadcast('auth:unauthorized', err);
      }
      throw err;
    }

    return {
      get: function (url, config) {
        return $http.get(apiBase + url, Object.assign({}, config || {}, { headers: authHeaders() })).catch(handleError);
      },
      post: function (url, data, config) {
        return $http.post(apiBase + url, data, Object.assign({}, config || {}, { headers: authHeaders() })).catch(handleError);
      },
      put: function (url, data, config) {
        return $http.put(apiBase + url, data, Object.assign({}, config || {}, { headers: authHeaders() })).catch(handleError);
      },
      delete: function (url, config) {
        return $http.delete(apiBase + url, Object.assign({}, config || {}, { headers: authHeaders() })).catch(handleError);
      },
    };
  })
  .controller('RootController', function ($scope, $rootScope, $location, TokenService, JwtService, ThemeService) {
    var self = this;
    self.isLoggedIn = !!TokenService.getToken();
    self.theme = ThemeService.getTheme();
    $rootScope.globalError = null;
    $rootScope.globalSuccess = null;

    $rootScope.$on('auth:login', function () {
      self.isLoggedIn = true;
    });

    $rootScope.$on('auth:unauthorized', function () {
      $rootScope.globalError = 'Session expired. Please log in again.';
      TokenService.clear();
      self.isLoggedIn = false;
      $location.path('/login');
    });

    self.logout = function () {
      TokenService.clear();
      self.isLoggedIn = false;
      $rootScope.globalError = null;
      $rootScope.globalSuccess = null;
      $location.path('/login');
    };

    self.toggleTheme = function () {
      self.theme = ThemeService.toggleTheme(self.theme);
    };

    self.getRole = function () {
      var token = TokenService.getToken();
      var decoded = JwtService.decode(token);
      return decoded && decoded.role;
    };
  })
  .controller('AuthController', function ($scope, $rootScope, $location, Api, ApiResponse, TokenService, UiFeedback) {
    var self = this;
    self.form = { email: '', password: '', name: '', phone: '', department: '', year: null, hostel: '', bio: '' };

    function getMsg(err) {
      var data = err && err.data && err.data.error;
      return (data && data.message) ? data.message : 'Request failed';
    }

    self.login = function () {
      UiFeedback.clear();
      Api.post('/auth/login', {
        email: self.form.email,
        password: self.form.password,
      }).then(function (resp) {
        var data = ApiResponse.unwrap(resp);
        if (data && data.token) {
          TokenService.setToken(data.token);
          $rootScope.$broadcast('auth:login');
        }
        UiFeedback.setSuccess('Login successful.');
        $location.path('/dashboard');
      }).catch(function (err) {
        UiFeedback.setError(getMsg(err));
      });
    };

    self.signup = function () {
      UiFeedback.clear();
      Api.post('/auth/signup', {
        name: self.form.name,
        email: self.form.email,
        password: self.form.password,
        phone: self.form.phone,
        department: self.form.department,
        year: self.form.year,
        hostel: self.form.hostel,
        bio: self.form.bio,
      }).then(function () {
        // After signup, go to login for a clean flow.
        UiFeedback.setSuccess('Account created. Please log in.');
        $location.path('/login');
      }).catch(function (err) {
        UiFeedback.setError(getMsg(err));
      });
    };
  })
  .controller('DashboardController', function ($scope, Api, ApiResponse, TokenService, JwtService, $q, UiFeedback) {
    var dash = this;
    dash.myComplaintsCount = 0;
    dash.myLostCount = 0;
    dash.myFoundCount = 0;
    dash.myClaimsCount = 0;
    dash.recentComplaints = [];
    dash.recentLostItems = [];
    dash.recentFoundItems = [];
    dash.recentClaims = [];
    dash.isStaff = false;
    dash.loading = false;
    dash.complaintSummary = { total: 0, pending: 0, resolved: 0 };

    function loadCounts() {
      dash.loading = true;
      var decoded = JwtService.decode(TokenService.getToken());
      var myId = decoded && decoded.sub ? decoded.sub : null;
      dash.isStaff = decoded && ['staff', 'admin'].includes(decoded.role);

      return $q.all([
        Api.get('/complaints'),
        Api.get('/complaints/summary'),
        Api.get('/lost-items?status=active'),
        Api.get('/found-items?status=active'),
        Api.get('/claims'),
      ]).then(function (responses) {
        var complaints = (ApiResponse.unwrap(responses[0]).complaints) || [];
        dash.complaintSummary = ApiResponse.unwrap(responses[1]) || dash.complaintSummary;
        var lost = (ApiResponse.unwrap(responses[2]).lostItems) || [];
        var found = (ApiResponse.unwrap(responses[3]).foundItems) || [];
        var claims = (ApiResponse.unwrap(responses[4]).claims) || [];

        dash.myComplaintsCount = myId ? complaints.filter(function (x) { return x.createdBy && x.createdBy._id === myId; }).length : 0;
        dash.myLostCount = myId ? lost.filter(function (x) { return x.createdBy && x.createdBy._id === myId; }).length : lost.length;
        dash.myFoundCount = myId ? found.filter(function (x) { return x.createdBy && x.createdBy._id === myId; }).length : found.length;
        dash.myClaimsCount = claims.length;

        dash.recentComplaints = complaints.slice(0, 3);
        dash.recentLostItems = lost.slice(0, 3);
        dash.recentFoundItems = found.slice(0, 3);
        dash.recentClaims = claims.slice(0, 3);
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load dashboard');
      }).finally(function () {
        dash.loading = false;
      });
    }

    dash.load = loadCounts;
    dash.load();
  })
  .controller('ComplaintsController', function ($scope, Api, ApiResponse, TokenService, JwtService, UiFeedback) {
    var self = this;
    self.items = [];
    self.userId = null;
    self.isAdmin = false;
    self.isStaff = false;
    self.sortBy = 'date';
    self.minSupports = 0;
    self.loading = false;
    self.statusFilter = '';
    self.categoryFilter = '';
    self.searchText = '';

    var decoded = JwtService.decode(TokenService.getToken());
    self.userId = decoded && decoded.sub ? decoded.sub : null;
    self.isAdmin = decoded && decoded.role === 'admin';
    self.isStaff = decoded && ['staff', 'admin'].includes(decoded.role);
    self.canCreate = decoded && decoded.role === 'student';

    self.form = { title: '', description: '', category: 'maintenance', location: '' };

    self.isOwner = function (complaint) {
      return complaint && complaint.createdBy && complaint.createdBy._id === self.userId;
    };

    self.importanceLabel = function (lvl) {
      if (lvl === 3) return 'Critical';
      if (lvl === 2) return 'High';
      if (lvl === 1) return 'Low';
      return 'Normal';
    };

    self.load = function () {
      self.loading = true;
      var qs = '?sortBy=' + encodeURIComponent(self.sortBy) + '&order=desc';
      if (self.minSupports !== null && self.minSupports !== undefined && String(self.minSupports).length) {
        qs += '&minSupports=' + encodeURIComponent(self.minSupports);
      }
      if (self.statusFilter) qs += '&status=' + encodeURIComponent(self.statusFilter);
      if (self.categoryFilter) qs += '&category=' + encodeURIComponent(self.categoryFilter);
      if (self.searchText) qs += '&q=' + encodeURIComponent(self.searchText);
      Api.get('/complaints' + qs).then(function (resp) {
        self.items = (ApiResponse.unwrap(resp).complaints) || [];
        self.items.forEach(function (c) {
          c.editImportanceLevel = (c.importanceLevel !== undefined && c.importanceLevel !== null) ? String(c.importanceLevel) : '0';
          c.editNextStatus = c.status;
        });
      }).catch(function (err) {
        var msg = err && err.data && err.data.error && err.data.error.message ? err.data.error.message : 'Failed to load complaints';
        UiFeedback.setError(msg);
      }).finally(function () {
        self.loading = false;
      });
    };

    self.assignToMe = function (c) {
      if (!c || !c._id) return;
      Api.put('/complaints/' + c._id + '/assign', {}).then(function () {
        UiFeedback.setSuccess('Assigned.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to assign complaint');
      });
    };

    self.setStatus = function (c) {
      if (!c || !c._id) return;
      Api.put('/complaints/' + c._id + '/status', { status: c.editNextStatus }).then(function () {
        UiFeedback.setSuccess('Status updated.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to update status');
      });
    };


    self.create = function () {
      UiFeedback.clear();
      Api.post('/complaints', self.form).then(function () {
        self.form = { title: '', description: '', category: 'maintenance', location: '' };
        self.load();
        UiFeedback.setSuccess('Complaint submitted successfully.');
      }).catch(function (err) {
        var msg = err && err.data && err.data.error && err.data.error.message ? err.data.error.message : 'Failed to submit';
        UiFeedback.setError(msg);
      });
    };

    self.toggleEdit = function (id) {
      self.items.forEach(function (c) {
        if (c._id === id) {
          c._editing = !c._editing;
          c.editTitle = c.title;
          c.editDescription = c.description;
        } else {
          c._editing = false;
        }
      });
    };

    self.update = function (id) {
      var target = self.items.find(function (c) { return c._id === id; });
      if (!target) return;

      var payload = {
        title: target.editTitle,
        description: target.editDescription,
      };

      Api.put('/complaints/' + id, payload).then(function () {
        target._editing = false;
        self.load();
        UiFeedback.setSuccess('Complaint updated successfully.');
      }).catch(function (err) {
        var msg = err && err.data && err.data.error && err.data.error.message ? err.data.error.message : 'Failed to update complaint';
        UiFeedback.setError(msg);
      });
    };

    self.remove = function (id) {
      if (!confirm('Delete this complaint?')) return;
      Api.delete('/complaints/' + id).then(function () {
        self.load();
        UiFeedback.setSuccess('Complaint deleted.');
      }).catch(function (err) {
        var msg = err && err.data && err.data.error && err.data.error.message ? err.data.error.message : 'Failed to delete complaint';
        UiFeedback.setError(msg);
      });
    };

    self.support = function (c) {
      if (!c || !c._id) return;
      Api.post('/complaints/' + c._id + '/support', {}).then(function (resp) {
        var updated = ApiResponse.unwrap(resp) && ApiResponse.unwrap(resp).complaint ? ApiResponse.unwrap(resp).complaint : null;
        if (updated) {
          c.supportedByMe = true;
          c.supportsCount = updated.supportsCount;
        }
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to support complaint');
      });
    };

    self.unsupport = function (c) {
      if (!c || !c._id) return;
      Api.delete('/complaints/' + c._id + '/support').then(function (resp) {
        var updated = ApiResponse.unwrap(resp) && ApiResponse.unwrap(resp).complaint ? ApiResponse.unwrap(resp).complaint : null;
        if (updated) {
          c.supportedByMe = false;
          c.supportsCount = updated.supportsCount;
        }
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to remove support');
      });
    };

    self.setImportance = function (c) {
      if (!c || !c._id) return;
      Api.put('/complaints/' + c._id + '/importance', { importanceLevel: Number(c.editImportanceLevel) }).then(function () {
        self.load();
        UiFeedback.setSuccess('Importance updated.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to set importance');
      });
    };

    self.load();
  })
  .controller('LostItemsController', function ($scope, Api, ApiResponse, TokenService, JwtService, $location, UiFeedback) {
    var self = this;
    self.items = [];
    self.isStaff = false;
    self.userId = null;
    self.statusFilter = 'active';

    var decoded = JwtService.decode(TokenService.getToken());
    self.isStaff = decoded && ['staff', 'admin'].includes(decoded.role);
    self.userId = decoded && decoded.sub ? decoded.sub : null;

    self.isOwner = function (item) {
      return item && item.createdBy && item.createdBy._id === self.userId;
    };

    self.form = {
      itemName: '',
      description: '',
      locationFoundOrLastSeen: '',
      date: new Date().toISOString().slice(0, 10),
    };

    self.load = function () {
      Api.get('/lost-items?status=' + encodeURIComponent(self.statusFilter)).then(function (resp) {
        self.items = (ApiResponse.unwrap(resp).lostItems) || [];
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load lost items');
      });
    };

    self.setStatus = function (st) {
      self.statusFilter = st;
      self.load();
    };

    self.create = function () {
      UiFeedback.clear();
      Api.post('/lost-items', self.form).then(function () {
        self.form = { itemName: '', description: '', locationFoundOrLastSeen: '', date: new Date().toISOString().slice(0, 10) };
        self.load();
        UiFeedback.setSuccess('Lost item reported.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to submit');
      });
    };

    self.toggleEdit = function (id) {
      self.items.forEach(function (x) {
        if (x._id === id) {
          x._editing = !x._editing;
          x.editItemName = x.itemName;
          x.editDescription = x.description;
          x.editLocationFoundOrLastSeen = x.locationFoundOrLastSeen;
          x.editStatus = x.status;
        } else {
          x._editing = false;
        }
      });
    };

    self.update = function (id) {
      var target = self.items.find(function (x) { return x._id === id; });
      if (!target) return;

      var payload = {
        itemName: target.editItemName,
        description: target.editDescription,
        locationFoundOrLastSeen: target.editLocationFoundOrLastSeen,
        status: target.editStatus,
      };

      Api.put('/lost-items/' + id, payload).then(function () {
        target._editing = false;
        self.load();
        UiFeedback.setSuccess('Lost item updated.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to update lost item');
      });
    };

    self.remove = function (id) {
      if (!confirm('Delete this lost item?')) return;
      Api.delete('/lost-items/' + id).then(function () {
        self.load();
        UiFeedback.setSuccess('Lost item deleted.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to delete lost item');
      });
    };

    self.startClaim = function (type, itemId) {
      // Prefill claim form and navigate.
      localStorage.setItem('pending_claim', JSON.stringify({ type: type, itemId: itemId }));
      $location.path('/claims');
    };

    self.close = function (item) {
      if (!item || !item._id) return;
      Api.put('/lost-items/' + item._id, { status: 'closed' }).then(function () {
        UiFeedback.setSuccess('Lost item closed.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to close item');
      });
    };

    self.reopen = function (item) {
      if (!item || !item._id) return;
      Api.put('/lost-items/' + item._id, { status: 'active' }).then(function () {
        UiFeedback.setSuccess('Lost item reopened.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to reopen item');
      });
    };

    self.load();
  })
  .controller('FoundItemsController', function ($scope, Api, ApiResponse, TokenService, JwtService, $location, UiFeedback) {
    var self = this;
    self.items = [];
    self.isStaff = false;
    self.userId = null;
    self.statusFilter = 'active';

    var decoded = JwtService.decode(TokenService.getToken());
    self.isStaff = decoded && ['staff', 'admin'].includes(decoded.role);
    self.userId = decoded && decoded.sub ? decoded.sub : null;

    self.isOwner = function (item) {
      return item && item.createdBy && item.createdBy._id === self.userId;
    };

    self.form = {
      itemName: '',
      description: '',
      locationFound: '',
      date: new Date().toISOString().slice(0, 10),
    };

    self.load = function () {
      Api.get('/found-items?status=' + encodeURIComponent(self.statusFilter)).then(function (resp) {
        self.items = (ApiResponse.unwrap(resp).foundItems) || [];
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load found items');
      });
    };

    self.setStatus = function (st) {
      self.statusFilter = st;
      self.load();
    };

    self.create = function () {
      UiFeedback.clear();
      Api.post('/found-items', self.form).then(function () {
        self.form = { itemName: '', description: '', locationFound: '', date: new Date().toISOString().slice(0, 10) };
        self.load();
        UiFeedback.setSuccess('Found item posted.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to submit');
      });
    };

    self.toggleEdit = function (id) {
      self.items.forEach(function (x) {
        if (x._id === id) {
          x._editing = !x._editing;
          x.editItemName = x.itemName;
          x.editDescription = x.description;
          x.editLocationFound = x.locationFound;
          x.editStatus = x.status;
        } else {
          x._editing = false;
        }
      });
    };

    self.update = function (id) {
      var target = self.items.find(function (x) { return x._id === id; });
      if (!target) return;

      var payload = {
        itemName: target.editItemName,
        description: target.editDescription,
        locationFound: target.editLocationFound,
        status: target.editStatus,
      };

      Api.put('/found-items/' + id, payload).then(function () {
        target._editing = false;
        self.load();
        UiFeedback.setSuccess('Found item updated.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to update found item');
      });
    };

    self.remove = function (id) {
      if (!confirm('Delete this found item?')) return;
      Api.delete('/found-items/' + id).then(function () {
        self.load();
        UiFeedback.setSuccess('Found item deleted.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to delete found item');
      });
    };

    self.startClaim = function (type, itemId) {
      localStorage.setItem('pending_claim', JSON.stringify({ type: type, itemId: itemId }));
      $location.path('/claims');
    };

    self.close = function (item) {
      if (!item || !item._id) return;
      Api.put('/found-items/' + item._id, { status: 'closed' }).then(function () {
        UiFeedback.setSuccess('Found item closed.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to close item');
      });
    };

    self.reopen = function (item) {
      if (!item || !item._id) return;
      Api.put('/found-items/' + item._id, { status: 'active' }).then(function () {
        UiFeedback.setSuccess('Found item reopened.');
        self.load();
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to reopen item');
      });
    };

    self.load();
  })
  .controller('ClaimsController', function ($scope, $rootScope, Api, ApiResponse, TokenService, JwtService, UiFeedback) {
    var self = this;

    self.items = [];
    self.userId = null;
    self.isStaff = false;

    var decoded = JwtService.decode(TokenService.getToken());
    self.userId = decoded && decoded.sub ? decoded.sub : null;
    self.isStaff = decoded && ['staff', 'admin'].includes(decoded.role);

    self.form = { type: 'lost', itemId: null, message: '' };
    self.activeItems = [];

    function loadActiveItems() {
      if (self.form.type === 'lost') {
        return Api.get('/lost-items?status=active').then(function (resp) {
          self.activeItems = (ApiResponse.unwrap(resp).lostItems) || [];
          if (!self.form.itemId && self.activeItems.length) self.form.itemId = self.activeItems[0]._id;
        }).catch(function (err) {
          UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load active lost items');
        });
      }
      return Api.get('/found-items?status=active').then(function (resp) {
        self.activeItems = (ApiResponse.unwrap(resp).foundItems) || [];
        if (!self.form.itemId && self.activeItems.length) self.form.itemId = self.activeItems[0]._id;
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load active found items');
      });
    }

    self.onTypeChange = function () {
      self.form.itemId = null;
      self.activeItems = [];
      loadActiveItems();
    };

    self.load = function () {
      Api.get('/claims').then(function (resp) {
        self.items = (ApiResponse.unwrap(resp).claims) || [];
        self.items.forEach(function (cl) {
          // Backend populates `claimedBy` without an `id` field; normalize for template.
          if (cl.claimedBy && cl.claimedBy._id) cl.claimedBy.id = cl.claimedBy._id;
          cl.editClaimStatus = cl.claimStatus;
          cl.editMessage = cl.message;
        });
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load claims');
      });
    };

    self.create = function () {
      if (!self.form.itemId) {
        UiFeedback.setError('Please select an item.');
        return;
      }

      var payload = {
        type: self.form.type,
        message: self.form.message,
      };
      if (self.form.type === 'lost') payload.lostItemId = self.form.itemId;
      if (self.form.type === 'found') payload.foundItemId = self.form.itemId;

      Api.post('/claims', payload).then(function () {
        self.form.message = '';
        self.load();
        UiFeedback.setSuccess('Claim submitted.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to submit claim');
      });
    };

    self.update = function (id) {
      var target = self.items.find(function (c) { return c._id === id; });
      if (!target) return;

      var payload = {};
      if (self.isStaff) {
        payload.claimStatus = target.editClaimStatus;
      } else {
        payload.message = target.editMessage;
      }

      Api.put('/claims/' + id, payload).then(function () {
        self.load();
        UiFeedback.setSuccess('Claim updated.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to update claim');
      });
    };

    self.remove = function (id) {
      if (!confirm('Delete this claim?')) return;
      Api.delete('/claims/' + id).then(function () {
        self.load();
        UiFeedback.setSuccess('Claim deleted.');
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to delete claim');
      });
    };

    // If user clicked "Claim" from Lost/Found pages.
    var pending = localStorage.getItem('pending_claim');
    if (pending) {
      try {
        var data = JSON.parse(pending);
        if (data && data.type && data.itemId) {
          self.form.type = data.type;
          self.form.itemId = data.itemId;
        }
      } catch (e) {}
      localStorage.removeItem('pending_claim');
    }

    loadActiveItems().then(function () {
      self.load();
    });
  })
  .controller('ProfileController', function ($scope, Api, ApiResponse) {
    var self = this;
    self.user = {};
    self.activity = {};

    Api.get('/auth/me').then(function (resp) {
      var data = ApiResponse.unwrap(resp) || {};
      self.user = data.user || {};
      self.activity = data.activity || {};
    });
  })
  .controller('AdminDashboardController', function ($scope, Api, ApiResponse, TokenService, JwtService, UiFeedback) {
    var self = this;
    self.loading = false;
    self.allowed = false;
    self.analytics = { complaintsPerCategory: [], complaintsPerStatus: [] };

    var decoded = JwtService.decode(TokenService.getToken());
    self.allowed = decoded && decoded.role === 'admin';

    self.maxCount = function (arr) {
      if (!arr || !arr.length) return 1;
      return Math.max.apply(null, arr.map(function (x) { return x.count || 0; })) || 1;
    };

    self.load = function () {
      if (!self.allowed) {
        UiFeedback.setError('Admin access required.');
        return;
      }
      self.loading = true;
      Api.get('/complaints/analytics').then(function (resp) {
        self.analytics = ApiResponse.unwrap(resp) || self.analytics;
      }).catch(function (err) {
        UiFeedback.setError(err && err.data && err.data.error ? err.data.error.message : 'Failed to load analytics');
      }).finally(function () {
        self.loading = false;
      });
    };

    self.load();
  });

