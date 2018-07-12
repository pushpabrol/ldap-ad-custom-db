function changeEmail (email, newEmail, verified, callback) {
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
      filter: '(|(mail=' + mail + ')(cn=' + mail + '))',
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

  function getMailUpdateChange(mail) {
    return new ldapjs.Change({
      operation: 'replace',
      modification: {
        mail: mail
      }
    });
  }

  function changeEmailWithLdap(mail, newEmail, cb) {
    const client = getLdapClient();

    function done(err, changed) {
      client.destroy();
      cb(err, changed);
    }

    getDnByMail(mail, client, function(err, profile){
      if (err) return done(err);

      if (!profile) return done(new ValidationError("user_does_not_exist", "Email address " + mail + " is not registered"));

      client.modify(
        profile.object.dn,
        getMailUpdateChange(newEmail),
        function(err) {
          if (err) {

            console.log(err);
            return done(null, false);
          }

          done(null, true);
        });
    });
  }

  if (configuration.LDAP_URL) {
    changeEmailWithLdap(email, newEmail, callback);
  } else {
    callback(new Error('LDAP configuration missing'));
  }
}