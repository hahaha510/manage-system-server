const router = require("koa-router")();
const Dept = require("../models/deptSchema");
const util = require("./../utils/util");
const jwt = require("jsonwebtoken");
const md5 = require("md5");
router.prefix("/depts");

// 部门树形列表
router.get("/list", async (ctx) => {
  let { deptName } = ctx.request.query;
  let params = {};
  if (deptName) params.deptName = deptName;
  let rootList = await Dept.find(params);
  //你按指定名字查不用树形结构
  if (deptName) {
    ctx.body = util.success(rootList);
  } else {
    let treesList = getTreeDept(rootList, null, []);
    ctx.body = util.success(treesList);
  }
});

router.post("/operate", async (ctx) => {
  const { _id, action, ...params } = ctx.request.body;
  let info;
  try {
    if (action == "create") {
      await Dept.create(params);
      info = "创建成功";
    } else if (action == "edit") {
      params.updateTime = new Date();
      await Dept.findByIdAndUpdate(_id, params);
      info = "编辑成功";
    } else {
      await Dept.deleteOne({ _id });
      await Dept.deleteMany({ parent: { $all: [_id] } });
      info = "删除成功";
    }
    ctx.body = util.success("", info);
  } catch (error) {
    ctx.body = util.fail(error.stack);
  }
});
// 递归拼接树形列表
function getTreeDept(rootList, id, list) {
  for (let i = 0; i < rootList.length; i++) {
    let item = rootList[i];
    if (String(item.parentId.slice().pop()) == String(id)) {
      list.push(item._doc);
    }
  }
  list.map((item) => {
    item.children = [];
    getTreeDept(rootList, item._id, item.children);
    if (item.children.length == 0) {
      delete item.children;
    }
  });
  return list;
}

module.exports = router;
