/**
 * Configure Basic Authentication
 * Config parameters:
 * - basic_auth_users: should be a list like
 * [
 *   {"user":"test1", "password":"psw1"},
 *   {"user":"test2", "password":"psw2"},
 *   ...
 * ]
 * When no basic_auth_users presented, no authentication applied.
 */
exports.configureBasic = function(express, app, freshConfig) {
  if (!freshConfig().enable_basic_auth) {
    console.log('Warning: No basic authentication presented');
    return;
  } else {
    console.log('Info: HTTP Basic Authentication applied');
  }

  app.use(express.basicAuth(function(user, pass) {
    for (var i in freshConfig().basic_auth_users) {
      var cred = freshConfig().basic_auth_users[i];
      if ((cred["user"] === user) && (cred["password"] === pass)){
        return true;
      }
    }
    return false;
  }));
  
  app.use(function(request, response, next) {
    for (var i in freshConfig().basic_auth_users) {
      var cred = freshConfig().basic_auth_users[i];
      if ((cred["user"] === request.user && cred["group"])){
        response.grafana_editor_group = cred["group"];
      }
    }
    next();
  });

};
