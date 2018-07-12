function login (email, password, callback) {
  /*
   * Authentication using ldap direct connection
   */
  
  const ldapjs = require('ldapjs');
  const https = require('https');
  
  function getCaConfig() {
    var cas;
    if (configuration.LDAP_CA && configuration.LDAP_CA.length>1) {
      cas = https.globalAgent.options.ca || [];
      const ca=configuration.LDAP_CA.split(',').forEach((sCert) =>{
        var pem = "-----BEGIN CERTIFICATE-----\n";      
        while(sCert.length>64) {
          pem = pem + sCert.substring(0,64) + "\n";
          sCert = sCert.substring(64);
        }
        pem = pem + sCert + "\n-----END CERTIFICATE-----";
        cas.push(pem);
      });
    } else {
      cas = https.globalAgent.options.ca;
    }
    return cas;
  }
  
  function getLdapClient(cb) {
    var client = ldapjs.createClient({
      url: configuration.LDAP_URL,
      connectTimeout: 500,
      timeout: 1500,
      tlsOptions: {
        rejectUnauthorized: true,
        ca: getCaConfig()
      }
    }); 
    client.bind(      
      configuration.LDAP_USER,
      configuration.LDAP_PASSWORD,
      function onBind(err){
        if (err) return cb(err);        
        cb(null, client);
      });
  }
  
  function getProfileByMail(mail, client, cb) {
    const opts = {
      scope:  'sub',
      filter: '(|(mail=' + mail + ')(cn=' + mail + '))',
      timeLimit: 1,
      attributes: ['objectGUID','dn','cn','name','uid','displayName','sn','givenName', 'commonName','mail']
    };

    const entries = [];

    const done = function (err) {
      if (err) {
        console.log(err);
        return cb(new Error('Unable to search user'));
      }

      if (entries.length === 0) return cb();
      cb(null, entries[0]);
    };

    client.search(configuration.LDAP_BASE, opts, function(err, res){
      if (err) return done(err);
      
      res.on('searchEntry', function (entry) {
        entries.push(entry);
      }).once('error', function(err) {
        if (err.message === 'Size Limit Exceeded') {
          return done();
        }
        done(err);
      }).once('end', function() {
          return done();
      });
    });
  }
  
  function formatGUID(id) {
    const data= new Buffer(id,'binary');
    var template = '{3}{2}{1}{0}-{5}{4}-{7}{6}-{8}{9}-{10}{11}{12}{13}{14}{15}';
    for(var i=0; i<data.length; i++ ) {
        var dataStr = data[i].toString(16);
        dataStr = data[i] >= 16 ? dataStr : '0' + dataStr;
        // insert that character into the template
        template = template.replace( new RegExp( '\\{' + i + '\\}', 'g' ), dataStr );
    }

    return template;
  }
  
  function mapLdapProfile(profile){
    // TODOL define a single ID
    return {
      user_id: profile.cn,
      name: profile.displayName,
      family_name: profile.sn,
      given_name: profile.givenName,
      nickname: profile.cn || profile.commonName,
      email: profile.mail,
      email_verified: true
    };
  }

  function validateWithLdap(email, password, cb) {
    getLdapClient(function onClientReady(err,client) {
    
      if (err || !client) {
        console.log(err);
        return cb(new Error('User repository not available'));
      }
    
      function done(err, profile) {
        client.destroy();
        cb(err, profile);
      }

      getProfileByMail(email, client, function onProfile(err, profile){
        if (err) return done(err);

        if (!profile) return done(new WrongUsernameOrPasswordError(email, "Invalid Credentials"));

        client.bind(profile.dn, password, function onLogin(err) {
          if (err) return done(new WrongUsernameOrPasswordError(email, "Invalid Credentials"));
  
          return done(null,mapLdapProfile(profile.object));
        });
      });
    });
  }
  
  /*
   * Authentication using AD/LDAP connector
   */
  
  const jwt = require('jsonwebtoken');
  const request = require('request');
  
  function mapConnectorProfile(profile){
    return {
      user_id: profile.user_id,
      name: profile.name,
      family_name: profile.family_name,
      given_name: profile.given_name,
      nickname: profile.nickname,
      email: profile.email
    };
  }
  
  function validateWithConnector(email, password, cb) {
    request(
      {
        url: 'https://' + (configuration.CONNECTOR_IP || configuration.CONNECTOR_DOMAIN) + '/oauth/ro',
        method: 'POST',
        headers: {
          'Content-type' : 'application/json',
          'Host': configuration.CONNECTOR_DOMAIN,
        },
        rejectUnhauthorized: false,
        body: JSON.stringify({
            client_id: configuration.CONNECTOR_CLIENTID,
            username: email,
            password: password,
            connection: configuration.CONNECTOR_CONNECTION,
            grant_type: "password",
            scope: "openid profile"
        })
      },
      function(err, response, body) {
        if (err) {
          console.log(err);
          return cb(new Error('Unable to search user'));
        }
        
        if (response.statusCode===401) {
           return cb(new WrongUsernameOrPasswordError(email, "Invalid Credentials"));
         } else if (response.statusCode!==200) {
           console.log(response.statusCode);
           return cb(new Error('Unable to search user'));
         }

        const data=JSON.parse(body);
        if (!data.id_token) return cb(new Error("Unable to retrieve profile"));
        
        cb(null, mapConnectorProfile(jwt.decode(data.id_token)));
      });
  }
  
  try {
  if (configuration.CONNECTOR_CONNECTION){
    console.log('Validating with AD/LDAP connector');
    validateWithConnector(email, password, callback);
  } else if (configuration.LDAP_URL) {
    console.log('Validating with ldapjs connection');
    validateWithLdap(email, password, callback);
  } else {
    callback(new Error('LDAP configuration missing'));
  }
  } catch (exc) {
    callback(new Error('LDAP configuration incorrect'));
  }
}