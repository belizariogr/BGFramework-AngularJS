module.exports.setup = function(){
	global.utils = require('./services/utils.js');
	global.dbutils = require('./services/dbutils.js');
	global.token_service = require('./services/token.js');
	token_service.setup(global.config);
	if (!global.bcrypt && config.encrypt_password != 0) {
		global.bcrypt = require('bcrypt');
		global.saltRounds = 10;
	};
	global.extras = {};
	const extras = require('./services/resources.js').getExtras();
	extras.forEach(function(r){
		global.utils.setPropValue(global.extras, r, require('../extras/' + r + '.js'));
	});
	global.db_conn = require('./database/' + global.config.database_type + '/connection.js').setup(config);
	global.getModel = function(dir){
		var model = Object.assign(new modelPrototype(), require(dir + '/model.js'));
		if (!!model.fields){
			if (config.account_field)
				model.fields.unshift({name: config.account_field, dataType: "integer", key: true, hidden: true});
			if (config.creation_field)
				model.fields.unshift({name: config.creation_field, dataType: "datetime"});
			if (config.modification_field)
				model.fields.unshift({name: config.modification_field, dataType: "datetime"});
			if (config.deletion_field)
				model.fields.unshift({name: config.deletion_field, dataType: "datetime"});
		}
		return model;
	};
}

