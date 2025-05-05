/**
 * 通用工具函数
 */
const log4js = require("./log4j");
const jwt = require("jsonwebtoken");
const CODE = {
  SUCCESS: 200,
  PARAM_ERROR: 10001, // 参数错误
  USER_ACCOUNT_ERROR: 20001, //账号或密码错误
  USER_LOGIN_ERROR: 30001, // 用户未登录
  BUSINESS_ERROR: 40001, //业务请求失败
  AUTH_ERROR: 500001, // 认证失败或TOKEN过期
};
module.exports = {
  /**
   * 分页结构封装
   */
  pager({ pageNum = 1, pageSize = 10 }) {
    // 转成数字
    pageNum *= 1;
    pageSize *= 1;
    // 下一页开始的索引
    const skipIndex = (pageNum - 1) * pageSize;
    return {
      page: {
        pageNum,
        pageSize,
      },
      skipIndex,
    };
  },
  success(data = "", msg = "", code = CODE.SUCCESS) {
    log4js.debug(data);
    return {
      code,
      data,
      msg,
    };
  },
  fail(msg = "", code = CODE.BUSINESS_ERROR, data = "") {
    log4js.debug(msg);
    return {
      code,
      data,
      msg,
    };
  },
  CODE,
  Decoded(authorization) {
    if (authorization) {
      let token = authorization.split(" ")[1];
      return jwt.verify(token, "imooc");
    }
    return "";
  },
  // 递归拼接树形列表
  getTreeMenu(rootList, id, list) {
    for (let i = 0; i < rootList.length; i++) {
      let item = rootList[i];
      // 这里id是BUffer类型 转为字符串
      // 不能直接pop 因为pop为修改原数组  用slice复制一份
      if (String(item.parentId.slice().pop()) == String(id)) {
        // items是mongo的model类型 _doc里面才是存的数据
        list.push(item._doc);
      }
    }
    list.map((item) => {
      item.children = [];
      this.getTreeMenu(rootList, item._id, item.children);
      if (item.children.length == 0) {
        delete item.children;
      } else if (item.children.length > 0 && item.children[0].menuType == 2) {
        // 给类型是按钮的添加一个action数据
        item.action = item.children;
      }
    });
    return list;
  },
  formateDate(date, rule) {
    let fmt = rule || "yyyy-MM-dd hh:mm:ss";
    if (/(y+)/.test(fmt)) {
      fmt = fmt.replace(RegExp.$1, date.getFullYear());
    }
    const o = {
      "M+": date.getMonth() + 1,
      "d+": date.getDate(),
      "h+": date.getHours(),
      "m+": date.getMinutes(),
      "s+": date.getSeconds(),
    };
    for (let k in o) {
      if (new RegExp(`(${k})`).test(fmt)) {
        const val = o[k] + "";
        fmt = fmt.replace(
          RegExp.$1,
          RegExp.$1.length == 1 ? val : ("00" + val).substr(val.length)
        );
      }
    }
    return fmt;
  },
  // 提取文件后缀
  extractExt(filename) {
    return filename.slice(filename.lastIndexOf("."), filename.length);
  },
};
