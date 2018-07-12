# Custom AD/LDS database

## Deployment
Custom database scripts were implemented for AD/LDAP CRUD operations. To deploy these go to the Auth0 Management Console create the database connection, mark it as custom and define the scripts. Some scripts can only be set via management api and are mentioned below.

This includes [change_email](change_email.js) and [get_user](get_user.js) that cannot be edited using the Dashboard so the connection has to be modified using either the Management API

In addition to the scripts the following configurations must be provided:

 * **LDAP_URL**: This is the LDAP Server where credentials are stored. In the case of AD/LDS use SSL since AD/LDS does not allow to change password over unencrypted channels.
 * **LDAP_BASE**: Defines the location in the directory from which the LDAP search begins.
 * **LDAP_USER**: The DN of the user that will connect to LDAP to search, create, update and delete users.
 * **LDAP_PASSWORD**: The password of the user that will connect to LDAP to search, create, update and delete users.
 * **LDAP_USERS_BASE**: The DN of the container where new users will be created.
 * **LDAP_CA**: A string representing the valid CA's used to connect using SSL. This string have to be constructed with the single line Base64 represntation of all certificates delimited by comma (,)

Optionally the database can use the AD/LDAP connector to authenticate the users. This option was implemented given the persistent connection used by the connector however after testing it no benefit was found and it was not used. To enable this option the following additional parameters can be configured:

 * **CONNECTOR_CONNECTION**: The name of the Auth0 connection configured to use the AD/LDAP connector
 * **CONNECTOR_IP**: If name resolution is not available on the environment allows to specify the IP of the Auth0 server
 * **CONNECTOR_DOMAIN**: The Auth0 tenant's domain where the connector has been configured
 * **CONNECTOR_CLIENTID**: The client ID created to allow the database to authenticate using the AD/LDAP connector
 