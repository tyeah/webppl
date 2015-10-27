var erp = require('../src/erp.js');

var verps = {};

// For each ERP, define a version that has an importance ERP that uses its own stored parameters
//    instead of the parameters passed to its sample and score functions.
for (var propname in erp) {
  var prop = erp[propname];
  if (typeof(prop) === 'object' && prop instanceof erp.ERP) {
    var erpObj = prop;
    var impErpObj = _.extend(_.clone(erpObj), {
      baseERP: erpObj,
      setParams: function(params) {
        this.params = params;
      },
      sample: function(params) { return this.baseERP.sample(this.params); },
      score: function(params, val) { return this.baseERP.score(this.params, val); }
    });
    var vErpObj = _.extend(_.clone(erpObj), {
      importanceERP: impErpObj
    });
    verps[propname] = vErpObj;
  }
}

module.exports = verps;