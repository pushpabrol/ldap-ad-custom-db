function get_user (email, callback) {
  console.log(email);const ldapjs = require('ldapjs');
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

  function searchWithLdap(email, cb) {
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
        if (!profile) return done(null, null);
        return done(null,mapLdapProfile(profile.object));
      });
    });
  }

  try {
    if (configuration.LDAP_URL) {
      searchWithLdap(email, callback);
    } else {
      callback(new Error('LDAP configuration missing'));
    }
  } catch (exc) {
    callback(new Error('LDAP configuration incorrect'));
  }
}