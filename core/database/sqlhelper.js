module.exports = {
	getFields: function(model){
		var fields = "";
		for (var i = 0; i < model.fields.length; i++){
			if (!model.fields[i].hidden){
				fields += model.fields[i].name + ' "' + model.fields[i].name + '"';
				if (i !== model.fields.length - 1)
					fields += ",";
				fields += " ";
			}
		}
		return fields;
	},

	getWhere: function(conditions){
		var where = "";
		var orBlock = false;
		conditions.forEach(function(c){
			if (c.dataType == "date"){
				if (c.valueEnd)
					where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + "CAST(" + c.field + " AS DATE) BETWEEN " + db_conn.escape(c.value) + " AND " + db_conn.escape(c.valueEnd);
				else
					where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + "CAST(" + c.field + " AS DATE) = " + db_conn.escape(c.value);
				if (c.startOr)
					orBlock = true;
				if(c.endOr){
					where += ")";
					orBlock = false;
				}
			} else if (c.dataType == "integer" || c.dataType == "numeric"){
				if (c.valueEnd)
					where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + c.field + " BETWEEN " + c.value + " AND " + c.valueEnd;
				else
					where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + c.field + " = " + c.value;
				if (c.startOr)
					orBlock = true;
				if(c.endOr){
					where += ")";
					orBlock = false;
				}
			} else if (c.options || c.dataType == "bool"){
				where += (!where ? "" : " AND ") + c.field + " IN (";
				var ins = '';
				c.values.forEach(function(v){
					ins += (ins ? ', ' : '') + db_conn.escape(v)
				});
				where += ins + ")";
			} else if (c.contains){
				c.value = "%" + c.value.replace(" ", "%") + "%";
				where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + "LOWER(" + c.field + ") LIKE LOWER(" + db_conn.escape(c.value) + ")";
				if (c.startOr)
					orBlock = true;
				if(c.endOr){
					where += ")";
					orBlock = false;
				}
			} else {
				where += (!where ? "" : (orBlock ? " OR " : " AND ")) + (c.startOr ? "(" : "") + c.field + " = " + db_conn.escape(c.value);
				if (c.startOr)
					orBlock = true;
				if(c.endOr){
					where += ")";
					orBlock = false;
				}
			}
		});
		if (where)
			where = 'WHERE ' + where;
		return where;
	},

	getOrderBy: function(orders){
		if (!orders)
			return;
		var orderby = "";
		orders.forEach(function(o){
			orderby += (!!orderby ? ", " : "") + o.field + (!!o.sort ? " " + o.sort : "");
		});
		if (orderby)
			orderby = " ORDER BY " + orderby;
		return orderby;
	},

	getCount: function(conn, table, where){
		countSQL = "SELECT count(*) \"count\" FROM " + table + " " + where;
		return conn.syncQuery(countSQL)
	},

	getInsert: function(dataset, model){
		var sql = "INSERT INTO " + model.resource + " (";
		var ins = "";
		var vals = "";
		dataset.fields.forEach(function(f){
			ins += (!ins ? "" : ", ") + f;
			vals += (!vals ? "" : ", ") + '?';
		});
		sql += ins + ") VALUES (" + vals + ")";
		return sql;
	},

	getUpdate: function(conn, dataset, model){
		var sql = "UPDATE " + model.resource + " SET ";
		var upd = "";
		var whr = "";
		var vals = dataset.values;
		dataset.fields.forEach(function(f){
			upd += (!upd ? "" : ", ") + f + " = ? ";
		});
		sql += upd + " WHERE";
		var keys = dbutils.getKeys(model);
		keys.forEach(function(k){
			whr += (!whr ? " (" : " AND (") + k.name + " = " + conn.escape(dataset.getValue(k.name)) + ")";		
		});
		sql += whr;
		return sql;
	},

	getDelete: function(conn, dataset, model){
		var sql = "DELETE FROM " + model.resource;
		var whr = "";
		var vals = [];
		var keys = dbutils.getKeys(model);
		keys.forEach(function(k){
			whr += (!whr ? " (" : " AND (") + k.name + " = " + conn.escape(dataset.getValue(k.name)) + ")";
		});
		sql += " WHERE " + whr;
		return sql;		
	},

	asyncQuery: function(conn, sql, params){
		return new Promise(function(resolve, reject){
			if (!!params)
				conn.query(sql, params, function(error, result, fields){
					resolve({error: error, rows: result, fields: fields})
				});
			else
				conn.query(sql, function(error, result, fields){					
					resolve({error: error, rows: result, fields: fields});
				});
		})
	},

	get: async function(conn, model, conditions, orders, page){
		var fields = this.getFields(model);
		var where = this.getWhere(conditions);		
		var orderby = this.getOrderBy(orders);
		var sql = conn.getSelectSQL(model.resource, fields, where, "", orderby, page);		
		var recCount;
		if (typeof page == "number" && page > 0)
			 recCount = conn.getCount(conn, model.resource, where);					
		var result = await this.asyncQuery(conn, sql);
		if (result.error)
			throw result.error;
		if (page){
			c = c - 1;
			var dataset = {page: page, pagecount: Math.floor(recCount / config.page_records) + 1, iat: new Date().getTime(), rows: result.rows};
		} else
			var dataset = {iat: new Date().getTime(), rows: result.rows};
		return dataset;
	},

	insert: async function(conn, model, dataset){
		var autoIncField = dbutils.getAutoIncFieldName(model, dataset);		
		if (!!autoIncField){
			var r = await this.asyncQuery(conn, conn.getAutoIncSQL(dataset.getValue(config.account_field), model.resource));
			if (r.error)
				throw r.error;
			var autoIncValue = dbutils.getValueByIndex(r.rows[0], 0);
			dataset.setValue(autoIncField, autoIncValue);
		}		
		var res = await this.asyncQuery(conn, this.getInsert(dataset, model), dataset.values);
		if (res.error)
			throw res.error;
		return {iat: new Date().getTime(), rows: dataset.getRecord(model.fields)};
	},

	update: async function(conn, model, dataset){
		var res = await this.asyncQuery(conn, this.getUpdate(conn, dataset, model), dataset.values);
		if (res.error)
			throw res.error;
		return {iat: new Date().getTime(), rows: dataset.getRecord(model.fields)};
	},

	delete: async function(conn, model, dataset){
		var res = await this.asyncQuery(conn, this.getDelete(conn, dataset, model), dataset.values);
		if (res.error)
			throw res.error;
		return {iat: new Date().getTime()};
	}		
}