var config = require('./config');
var _ = require('underscore');
var NodeRSA = require('node-rsa');
var aes = require('./aes_enc_dec'); 

function isNotEmptyObj(val){
	return _.isObject(val) && !_.isEmpty(val)
}
/**
 * 将字符串转化为查询字符串
 * @param object json
 * @return str
*/
function jsonToSearch(json){
	var str = "";
	for(var key in json){
		if(json.hasOwnProperty(key)){
			str += key + '=' + json[key]+'&';
		}
	}
	//把最后的&去掉
	if(str){
		str = str.substring(0,str.length -1);
	}
	return str;
}
/**
 * 对象按键排序
 * @param object obj
   @param boolean desc
 * @return object
*/
function sortObjectByKey(obj,desc){
	var keys = Object.keys(obj);
	var returnObj = {};
	keys = keys.sort();
	if(desc){
		keys = keys.reverse();
	}
	for(var i = 0 , len = keys.length ; i < len ; i++){
		returnObj[keys[i]] = obj[keys[i]];
	}
	return returnObj;
}
/**
 * 拾取移动端网页支付所需参数
 * @param object obj
 * @return object
*/
function pickWebPayKeys(obj){
	//keys,详情请查看易宝文档-> http://mobiletest.yeepay.com/file/doc/pubshow?doc_id=14#ha_32
	var keys = ['merchantaccount','orderid','transtime','currency','amount','productcatalog','productname','productdesc','identityid','identitytype','terminaltype','terminalid','userip','userua','callbackurl','fcallbackurl','version','paytypes','cardno','bank','orderexpdate','sign'];
	return = _.pick(obj,keys);
}

/**
 * 检测支付必填参数是否齐全
 * @param object json
 * @return object
 */
function checkParam(json){
	if(!json.orderid){
		return false;
	}
	if(!json.transtime){
		return false;
	}
	if(!json.amount){
		return false;
	}
	if(!json.identityid){
		return false;
	}
	if(!json.userip){
		return false;
	}
	if(!json.userua){
		return false;
	}
}



/**
 * 易宝支付类
 * @param object customConfig
 */

function yeePay(customConfig){
	this.config = config;
	if(isNotEmptyObj(customConfig)){
		for(var key in customConfig){
			if(customConfig.hasOwnProperty(key)){
				this.config[key] = customConfig[key];
			}
		}
	}
	this.account = this.config['account'];
	this.merchantPublicKey = this.config['merchantPublicKey'];
	this.merchantPrivateKey = this.config['merchantPrivateKey'];
	this.yeepayPublicKey = this.config['yeepayPublicKey'];
	this.AESKey = '';
	this.AES = '';
}


/**
 * 获取默认配置
 * 
 * @return object
 */
yeePay.prototype.getDefaultConfig = function(){
	var thisConfig = this.config;
	return {
		merchantaccount:thisConfig.merchantaccount,
		currency:thisConfig.currency,
		productcatalog:thisConfig.productcatalog,
		productname:thisConfig.productname,
		productdesc:thisConfig.productdesc,
		identitytype:thisConfig.identitytype,
		terminaltype:thisConfig.terminaltype,
		terminalid:thisConfig.terminalid,
		callbackurl:thisConfig.callbackurl,
		fcallbackurl:thisConfig.fcallbackurl
	}
}
/**
 * 返回移动终端通用网页支付跳转URL地址
 * 
 * @param string order_id
 * @param string transtime
 * @param int amount
 * @param string product_catalog
 * @param string identity_id
 * @param int identity_type
 * @param string user_ip
 * @param string callbackurl
 * @param int currency
 * @param string product_name
 * @param string product_desc
 * @param string other
 * @return string
 */
yeePay.prototype.webPay = function(obj){
	//obj is Object,must need key:orderid,transtime,amount,userip,userua
	if(isNotEmptyObj(obj)){
		if(!checkParam(obj)){
			return null;
		}
		var queryObj = _.extend(this.getDefaultConfig(),obj);
		queryObj = pickWebPayKeys(queryObj);
		return this.getUrl(config.YEEPAY_MOBILE_API,'pay/request',queryObj);
	}
	return null;
}

/**
* 返回请求URL地址
* @param string $type
* @param string $method
* @param array $query
* @return string
*/

yeePay.prototype.getUrl = function(type,method,query){
	query = this.buildRequest(query);
	var url = this.getAPIUrl(type,method);
	url += '?' + jsonToSearch(query);
	return url;
}

/**
* 创建提交到易宝的最终请求
* 
* @param array $query
* @return array
*/

yeePay.prototype.buildRequest = function(query){
	var sign = this.RSASign(query);
	query['sign'] = sign;
	var request = {
		merchantaccount:this.account,
		encryptkey:this.getEncryptkey(),
		data:this.AESEncryptRequest(query)
	}
	return request;
}

/**
* 根据请求类型不同，返回完整API请求地址
* 
* @param int $type
* @param string $method
* @return string
*/

yeePay.prototype.getAPIUrl = function(type,method){
	if(type == config.YEEPAY_MERCHANT_API){
		return config.API_Merchant_Base_Url + method;
	}else if(type == config.YEEPAY_MOBILE_API){
		return config.API_Mobile_Pay_Base_Url + method;
	}else if(type == config.YEEPAY_PC_API){
		return config.API_PC_Pay_Base_Url + method;
	}else{
		return config.API_Pay_Base_Url + method;	
	}	
}
/**
 * 用RSA 签名请求
 * 
 * @param array $query
 * @return string
 */
yeePay.prototype.RSASign = function(obj){
	if(obj.sign){
		delete obj.sign;
	}
	obj = sortObjectByKey(obj);
	var values = _.values(obj);
	var valStr = values.join('');
	var key = new NodeRSA();
	key.importKey(this.merchantPrivateKey,'pkcs1');	
  	return key.encrypt(valStr,'base64','utf8');
}
/**
* 通过RSA，使用易宝公钥，加密本次请求的AESKey
* 
* @return string
*/
yeePay.prototype.getEncryptkey = function(){
	if(!this.AESKey){
		this.generateAESKey();
	}
	var key = new NodeRSA();
	key.importKey(this.yeepayPublicKey,'pkcs1');
	return key.encrypt(this.AESKey,'base64','utf8');
}
/**
* 生成一个随机的字符串作为AES密钥
* 
* @param number $length
* @return string
*/
yeePay.prototype.generateAESKey = function(){
	var baseString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	var AESKey = '',len = 16;
	for(var i = 0 ; i < len ; i++){
		AESKey += baseString[parseInt(Math.random()*(len-1))];
	}
	this.AESKey = AESKey;
	return AESKey;
}
/**
* 通过AES加密请求数据
* 
* @param array $query
* @return string
*/
yeePay.prototype.AESEncryptRequest = function(obj){
	if(!this.AESKey){
		this.generateAESKey();
	}
	return aes.enEAS(JSON.stringify(obj),this.AESKey);
}
/**
* 验证结果是否从易宝返回
* 
* @param string data
* @param string encryptkey
* @return boolean
*/
yeePay.prototype.verifySign = function(data,encryptkey){
	var key = new NodeRSA();
	key.importKey(this.merchantPrivateKey,'pkcs1');	
  	var yibaoAESKey = key.decrypt(encryptkey,'base64');
  	try{
  		data = JSON.parse aes.deEAS(data,yibaoAESKey);
  		var sign = data.sign;
  		delete data.sign;
  		if(this.RSASign(data) !== sign){
  			return false;
  		}
  		return true;
  	}catch(e){
  		console.error(e);
  		return false;
  	} 	
}
module.exports = yeePay;