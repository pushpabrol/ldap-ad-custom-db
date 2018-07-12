function remove (id, callback) {
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
    
  function getLdapClient() {
    return ldapjs.createClient({
      url: configuration.LDAP_URL,
      bindDN: configuration.LDAP_USER,
      bindCredentials: configuration.LDAP_PASSWORD,
      connectTimeout: 500,
      timeout: 1500,
      tlsOptions: {
        rejectUnauthorized: true,
        ca: getCaConfig()
      }
    }); 
  }
  
  function getDNsById(id, client, cb) {
    // TODO: define single ID field
    const opts = {
      scope:  'sub',
      filter: '(cn=' + id + ')',
      attributes: ['dn'],
      timeLimit: 1
    };

    const entries = [];

    const done = function (err) {
      if (err) {
        console.log(err);
        return cb(new Error('Unable to search user'));
      }

      cb(null, entries);
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
  
  function deleteWithLdap(id, cb) {
    const client = getLdapClient();
    
    function done(err) {
      client.destroy();
      cb(err);
    }

    getDNsById(id, client, function(err, entries){
      if (err) return done(err);
      
      console.log(entries);
    
      if (!entries || entries.length === 0) return done(new ValidationError("user_does_not_exist", "User with Id " + id + " is not registered"));      
      if (!entries || entries.length > 1) return done(new ValidationError("multiple_users", "There are multiple users with that id"));

      client.del(
        entries[0].object.dn,
        function(err) {
          if (err) {
            console.log(err);
            return done(new Error('User could not be deleted'));
          }
          
          done();
        });
    });
  }
  
  if (configuration.LDAP_URL) {
    deleteWithLdap(id, callback);
  } else {
    callback(new Error('LDAP configuration missing'));
  }
}