/**
 * Proxies the request to elasticsearch
 * node-http-proxy worked really well until it met elasticsearch deployed on cloudfoundry
 * hence this small proxy and naive proxy based on:
 * http://www.catonmat.net/http-proxy-in-nodejs/
 */
var http = require('http');

function proxyRequest(request, response, host, port, user, password, getProxiedRequestPath, isUI) {
  var filteredHeaders = {};
  Object.keys(request.headers).forEach(function(header) {
    if (header === 'host') {
      //most necessary:
      filteredHeaders[header] = host;
    } else if (header !== 'cookie' &&
        (isUI === true || (header !== 'referer' &&
               header !== 'user-agent' && header !== 'accept-language'))) {
      //avoid leaking unecessay info and save some room
      filteredHeaders[header] = request.headers[header];
    }
  });
  if (user) {
    var auth = 'Basic ' + new Buffer(user + ':' + password).toString('base64');
    filteredHeaders.authorization = auth;
  }

  var options =  {
    path: getProxiedRequestPath(request),
    method: request.method,
    hostname: host,
    port: port,
    headers: filteredHeaders
  };
  if (user) {
    options.auth = password ? user + ':' + password : user;
  }

  var proxyReq = http.request(options);

  proxyReq.addListener('error', function(err){
    response.status(500).send('Unable to process your request, ' + err.code);
    console.log('ElasticSearch Server Error: ' + err.code);
  });

  proxyReq.addListener('response', function(proxyResp) {
    var http10 = request.httpVersionMajor === 1 && request.httpVersionMinor < 1;
    if(http10 && proxyResp.headers['transfer-encoding'] !== undefined){
      //filter headers
      var headers = proxyResp.headers;
      delete proxyResp.headers['transfer-encoding'];
      var buffer = "";
      
      //buffer answer
      proxyResp.addListener('data', function(chunk) {
        buffer += chunk;
      });
      proxyResp.addListener('end', function() {
        headers['Content-length'] = buffer.length;//cancel transfer encoding "chunked"
        response.writeHead(proxyResp.statusCode, headers);
        response.write(buffer, 'binary');
        response.end();
      });
    } else {
      //send headers as received
      response.writeHead(proxyResp.statusCode, proxyResp.headers);
      
      //easy data forward
      proxyResp.addListener('data', function(chunk) {
        response.write(chunk, 'binary');
      });
      proxyResp.addListener('end', function() {
        response.end();
      });
    }
  });

  //proxies to SEND request to real server
  request.addListener('data', function(chunk) {
    proxyReq.write(chunk, 'binary');
  });
  request.addListener('end', function() {
    proxyReq.end();
  });
}

// always allow POST & PUT to these dashboards
var dashboardWhitelist = [
  "_search" //hack to support dashboard search
];

exports.configureESProxy = function(app, esHost, esPort, esUser, esPassword, basePath) {
  app.use(basePath + "/__es", function(request, response, next) {
    // authorisation for mutation to dashboards
    if (request.method == 'PUT' || request.method == 'POST') {
        
      var prefixAuthorised = false;
      
      // extract the name of the dash board from the elastic search request URL
      var dashboard = decodeURI(request.originalUrl.substr(request.originalUrl.lastIndexOf('/')+1));

      // check whitelist doesn't match
      if (dashboardWhitelist.indexOf(dashboard) != -1) {
        prefixAuthorised = true;
      } else {

        // deny if there are no groups for the authenticated user or none of the groups do not match the start of the dashboard name
        if (response.grafana_editor_groups) {
          var groups = response.grafana_editor_groups.toUpperCase().split(',');
          for (var i in groups) {
            if (dashboard.toUpperCase().indexOf(groups[i]) == 0) {
              prefixAuthorised = true;
              break;
            }
          }
        }
        
      }
      
      if (!prefixAuthorised) {
        console.log("Rejected request for dashboard "+dashboard+" from user "+request.user+" with groups ["+(response.grafana_editor_groups||"")+"]");
        response.writeHead(403, {"hcom.grafana-proxy.allowed-prefixes": response.grafana_editor_groups});
        response.end();
        return request.url;
      } else {
        console.log("Authorised request for dashboard "+dashboard+" from user "+request.user+" with groups ["+(response.grafana_editor_groups||"")+"]");
      }
      
    }
    proxyRequest(request, response, esHost, esPort, esUser, esPassword,
      function getProxiedRequestPath(request) {
        return request.url;
      });
  });
  app.use(basePath + "/_plugin", function(request, response, next) {
    proxyRequest(request, response, esHost, esPort, esUser, esPassword,
      function getProxiedRequestPath(request) {
        return request.originalUrl;
      }, true);
  });
};
