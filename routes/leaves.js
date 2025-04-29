const router = require("koa-router")();
const Leave = require("../models/leaveSchema");
const Dept = require("../models/deptSchema");
const util = require("./../utils/util");
const jwt = require("jsonwebtoken");
const md5 = require("md5");
router.prefix("/leave");

// 按页获取角色列表
router.get("/list", async (ctx) => {
  const { applyState, type } = ctx.request.query;
  const { page, skipIndex } = util.pager(ctx.request.query);
  let authorization = ctx.request.headers.authorization;
  let { data } = util.Decoded(authorization);
  let params = {};
  try {
    if (type == "approve") {
      if (applyState == 1 || applyState == 2) {
        // 要找待审核 必须当前审批人是我
        params.curAuditUserName = data.userName;
        //mongse的查询条件 满足两个的一个
        params.$or = [{ applyState: 1 }, { applyState: 2 }];
      } else if (applyState > 2) {
        params = { "auditFlows.userId": data.userId, applyState };
      } else {
        params = { "auditFlows.userId": data.userId };
      }
    } else {
      let params = {
        "applyUser.userId": data.userId,
      };
      if (applyState) params.applyState = applyState;
    }

    const query = Leave.find(params);
    const list = await query.skip(skipIndex).limit(page.pageSize);
    const total = await Leave.countDocuments(params);
    ctx.body = util.success({
      page: {
        ...page,
        total,
      },
      list,
    });
  } catch (error) {
    ctx.body = util.fail(`查询失败:${error.stack}`);
  }
});
router.post("/operate", async (ctx) => {
  const { _id, action, ...params } = ctx.request.body;
  let authorization = ctx.request.headers.authorization;
  let { data } = util.Decoded(authorization);
  if (action === "create") {
    // 生成申请号 由XJ和时间戳和总条数组成
    let orderNo = "XJ";
    orderNo += util.formateDate(new Date(), "yyyyMMdd");
    const total = await Leave.countDocuments();
    params.orderNo = orderNo + total;
    //获取用户当前部门ID
    let id = data.deptId.pop();
    //查到部门
    let dept = await Dept.findById(id);
    // 找到负责人
    let userList = await Dept.find({
      deptName: { $in: ["人事部", "财务部"] },
    });
    let auditUsers = dept.userName;
    let auditFlows = [
      {
        userId: dept.userId,
        userName: dept.userName,
        userEmail: dept.userEmail,
      },
    ];
    userList.map((item) => {
      auditFlows.push({
        userId: item.userId,
        userName: item.userName,
        userEmail: item.userEmail,
      });
      auditUsers += "," + item.userName;
    });
    params.auditUsers = auditUsers;
    params.curAuditUserName = dept.userName;
    params.auditFlows = auditFlows;
    params.auditLogs = [];
    params.applyUser = {
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail,
    };

    let res = await Leave.create(params);
    ctx.body = util.success("", "创建成功");
  } else {
    let res = await Leave.findByIdAndUpdate(_id, { applyState: 5 });
    ctx.body = util.success("", "操作成功");
  }
});

router.post("/approve", async (ctx) => {
  const { action, remark, _id } = ctx.request.body;
  let authorization = ctx.request.headers.authorization;
  let { data } = util.Decoded(authorization);
  let params = {};
  try {
    // 1:待审批 2:审批中 3:审批拒绝 4:审批通过 5:作废
    let doc = await Leave.findById(_id);
    let auditLogs = doc.auditLogs || [];
    if (action == "refuse") {
      params.applyState = 3;
    } else {
      // 审核通过
      if (doc.auditFlows.length == doc.auditLogs.length) {
        ctx.body = util.success("当前申请单已处理，请勿重复提交");
        return;
      } else if (doc.auditFlows.length == doc.auditLogs.length + 1) {
        params.applyState = 4;
      } else if (doc.auditFlows.length > doc.auditLogs.length) {
        params.applyState = 2;
        params.curAuditUserName =
          doc.auditFlows[doc.auditLogs.length + 1].userName;
      }
    }
    auditLogs.push({
      userId: data.userId,
      userName: data.userName,
      createTime: new Date(),
      remark,
      action: action == "refuse" ? "审核拒绝" : "审核通过",
    });
    params.auditLogs = auditLogs;
    let res = await Leave.findByIdAndUpdate(_id, params);
    ctx.body = util.success("", "处理成功");
  } catch (error) {
    ctx.body = util.fail(`查询异常：${error.message}`);
  }
});
router.get("/count", async (ctx) => {
  let authorization = ctx.request.headers.authorization;
  let { data } = util.Decoded(authorization);
  try {
    let params = {};
    params.curAuditUserName = data.userName;
    params.$or = [{ applyState: 1 }, { applyState: 2 }];
    const total = await Leave.countDocuments(params);
    ctx.body = util.success(total);
  } catch (error) {
    ctx.body = util.fail(`查询异常:${error.message}`);
  }
});
module.exports = router;
