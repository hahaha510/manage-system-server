/**
 * 用户管理模块路由
 */

const router = require("koa-router")();
const User = require("./../models/userSchema");
const Menu = require("./../models/menuSchema");
const Role = require("./../models/roleSchema");
const util = require("./../utils/util");
const jwt = require("jsonwebtoken");
const Counter = require("../models/counterSchema");
const md5 = require("md5");
router.prefix("/users");

// 用户登录
router.post("/login", async function (ctx) {
  try {
    const { userName, userPwd } = ctx.request.body;
    // mongdb的语法findOne函数里可以指定返回什么数据
    /**
     * 返回数据库指定字段，有三种方式
     * 1.'userId userName'
     * 2.{userId:1,_id:0} 1代表返回 0不返回
     * 3.select('userId) 对返回的数据select
     * 我觉得就用第一种
     */

    const res = await User.findOne(
      {
        userName,
        userPwd,
      },
      "userId userName userEmail state role deptId roleList"
    );
    console.log("111", res);
    // 这里才是后端要传的数据
    const data = res._doc;
    const token = jwt.sign(
      {
        data: data,
      },
      "imooc",
      // 如果是数字类型单位是秒 如果是字符串不写单位就是毫秒 h小时 d天
      { expiresIn: "1h" }
    );
    if (res) {
      data.token = token;
      ctx.body = util.success(data);
    } else {
      ctx.body = util.fail("账号密码不正确");
    }
  } catch (error) {
    ctx.body = util.fail(error.msg);
  }
});
// 用户列表
router.get("/list", async (ctx) => {
  const { userId, userName, state } = ctx.request.query;
  const { page, skipIndex } = util.pager(ctx.request.query);
  let params = {};
  if (userId) params.userId = userId;
  if (userName) params.userName = userName;
  if (state && state != 0) params.state = state;
  try {
    // 后面这个参数就是查到的数据 排除_id和userPwd这两个字段
    const query = User.find(params, { _id: 0, userPwd: 0 });
    const list = await query.skip(skipIndex).limit(page.pageSize);
    const total = await User.countDocuments(params);
    ctx.body = util.success({
      page: {
        ...page,
        total,
      },
      list,
    });
  } catch (error) {
    ctx.body = util.fail(`查询异常：${error.stack}`);
  }
});
// 用户删除/批量删除
router.post("/delete", async (ctx) => {
  const { userIds } = ctx.request.body;
  // 查出userId存在userIds数组中的数据 把它的state改为2
  const res = await User.updateMany({ userId: { $in: userIds } }, { state: 2 });
  if (res.modifiedCount) {
    ctx.body = util.success(res, `共删除成功${res.modifiedCount}条`);
    return;
  }
  ctx.body = util.fail("删除失败");
});
// 用户新增/编辑
router.post("/operate", async (ctx) => {
  const {
    userId,
    userName,
    userEmail,
    mobile,
    job,
    state,
    roleList,
    deptId,
    action,
  } = ctx.request.body;
  if (action === "add") {
    if (!userName || !userEmail || !deptId) {
      ctx.body = util.fail("参数错误", util.CODE.PARAM_ERROR);
      return;
    }

    // 后面那个参数 表示返回的字段
    const res = await User.findOne(
      { $or: [{ userName }, { userEmail }] },
      "_id userName userEmail"
    );
    // 如果找到了这个用户 所以重复了不能添加
    if (res) {
      ctx.body = util.fail(
        `系统检测到有重复用户,信息如下:${res.userName}-${res.userEmail}`
      );
    } else {
      const doc = await Counter.findOneAndUpdate(
        { _id: "userId" },
        { $inc: { sequence_value: 1 } },
        { new: true }
      );
      try {
        const user = new User({
          userId: doc.sequence_value,
          userName,
          userPwd: md5("123456"),
          userEmail,
          role: 1,
          roleList,
          job,
          state,
          deptId,
          mobile,
        });
        user.save();
        ctx.body = util.success("", "用户创建成功");
      } catch (error) {
        ctx.body = util.fail(error.stack, "用户创建失败");
      }
    }
  } else {
    if (!deptId) {
      ctx.body = util.fail("部门不能为空");
      return;
    }
    try {
      const res = await User.findOneAndUpdate(
        { userId },
        { mobile, job, state, roleList, deptId }
      );
      ctx.body = util.success("", "更新成功");
    } catch (error) {
      ctx.body = util.fail(error.stack, "更新失败");
    }
  }
});
// 获取全量用户列表  只返回指定字段
router.get("/all/list", async (ctx) => {
  try {
    const list = await User.find({}, "userId userName userEmail");
    ctx.body = util.success(list);
  } catch (error) {
    ctx.body = util.fail(error.stack);
  }
});
// 获取用户对应的权限菜单
router.get("/getPermissionList", async (ctx) => {
  let authorization = ctx.request.headers.authorization;
  let { data } = util.Decoded(authorization);
  let menuList = await getMenuList(data.role, data.roleList);
  let actionList = await getActionList(JSON.parse(JSON.stringify(menuList)));
  ctx.body = util.success({ menuList, actionList });
});
// 根据用户角色 0代表管理员返回所有菜单权限
// 1代表普通用户根据roleList去查找角色(数组 可能是前端也是产品经理)
// 根据返回的角色数组得到相应的权限 可能权限重复要去重 返回相应的菜单权限
const getMenuList = async (userRole, roleKeys) => {
  let rootList = [];
  if (userRole == 0) {
    rootList = (await Menu.find({})) || [];
  } else {
    let roleList = await Role.find({ _id: { $in: roleKeys } });
    let permissionList = [];
    roleList.map((role) => {
      let { checkedKeys, halfCheckedKeys } = role.permissionList;
      permissionList = permissionList.concat([
        ...checkedKeys,
        ...halfCheckedKeys,
      ]);
    });
    permissionList = [...new Set(permissionList)];
    rootList = await Menu.find({ _id: { $in: permissionList } });
  }
  return util.getTreeMenu(rootList, null, []);
};
const getActionList = async (list) => {
  const actionList = [];
  const deep = (arr) => {
    while (arr.length) {
      let item = arr.pop();
      if (item.action) {
        item.action.map((action) => {
          if (action.menuCode) actionList.push(action.menuCode);
        });
      } else if (item.children && !item.action) {
        deep(item.children);
      }
    }
  };
  deep(list);
  return actionList;
};
module.exports = router;
