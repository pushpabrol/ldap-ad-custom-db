function create (user, callback) {
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
  
  function getDnByMail(mail, client, cb) {
    const opts = {
      scope:  'sub',
      filter: '(|(mail=' + mail + ')(cn='+mail+'))',
      attributes: ['dn'],
      timeLimit: 1
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
  
  function mapAuth0Profile(profile){
    return {
      cn: profile.username || profile.email,
      name: profile.name || profile.email,
      sn : 'User',
      givenName: profile.given_name || profile.name || (profile.email && profile.email.split('@')[0]),
      mail: profile.email,      
      userPassword: profile.password,
      objectClass: ['top', 'person', 'organizationalPerson', 'user']
    };
  }

  function createWithLdap(user, cb) {
    const client = getLdapClient();
    
    function done(err) {
      client.destroy();
      cb(err);
    }
    
    getDnByMail(user.email, client, function(err, profile){
      if (err) return done(err);
    
      if (profile) return done(new ValidationError("user_exists", "Email address " + user.email + " already registered"));
      
      const ldapEntry = mapAuth0Profile(user);
      client.add(
        "cn=" + ldapEntry.cn + "," + configuration.LDAP_USERS_BASE,
        ldapEntry, 
        function(err) {
          if (err) {
            console.log(err);
            console.log(err.message);
            console.log(err.code);
            return done(new Error('User could not be created in directory'));
          }
          
          done();
        });
    });
  }
  
  if (configuration.LDAP_URL) {
    createWithLdap(user, callback);
  } else {
    callback(new Error('LDAP configuration missing'));
  }
}