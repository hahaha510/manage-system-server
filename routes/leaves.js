const router = require("koa-router")();
const Leave = require("../models/leaveSchema");
const Dept = require("../models/deptSchema");
const util = require("./../utils/util");
const multiparty = require("multiparty");
const path = require("path");
const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const fse = require("fs-extra");
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
router.post("/upload", (ctx) => {
  return new Promise((resolve) => {
    const form = new multiparty.Form();
    form.parse(ctx.req, async (err, fields, files) => {
      if (err) {
        ctx.body = util.fail("文件上传失败,请重新上传");
        resolve();
        return;
      }
      try {
        const fileHash = fields["fileHash"][0];
        const chunkHash = fields["chunkHash"][0];
        // 临时存放目录
        const chunkPath = path.resolve(UPLOAD_DIR, fileHash);
        if (!fse.existsSync(chunkPath)) {
          await fse.mkdir(chunkPath);
        }
        const oldPath = files["chunk"][0]["path"];
        await fse.move(oldPath, path.resolve(chunkPath, chunkHash));
        ctx.body = util.success();
      } catch (error) {
        ctx.body = util.fail(error.stack);
      }
      resolve();
    });
  });
});
router.post("/merge", async (ctx) => {
  const { fileHash, fileName, size } = ctx.request.body;

  // 如果文件已经存在,就没有必要再进行合并
  const filePath = path.resolve(
    UPLOAD_DIR,
    fileHash + util.extractExt(fileName)
  );
  if (fse.existsSync(filePath)) {
    ctx.body = util.success("", "合并成功");
    return;
  }
  // 如果不存在文件则需要去合并
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
  if (!fse.existsSync(chunkDir)) {
    ctx.body = util.fail("文件不存在,请重新上传");
    return;
  }
  // 执行合并操作
  // 拿到所有切片文件名数组
  const chunkPaths = await fse.readdir(chunkDir);
  chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  // 依次写入到文件中
  const list = chunkPaths.map((chunkName, index) => {
    return new Promise((resolve) => {
      const chunkPath = path.resolve(chunkDir, chunkName);
      const readStream = fse.createReadStream(chunkPath);
      const writeStream = fse.createWriteStream(filePath, {
        start: index * size,
        end: (index + 1) * size,
      });
      readStream.on("end", async () => {
        // 删除文件
        await fse.unlink(chunkPath);
        resolve();
      });
      readStream.pipe(writeStream);
    });
  });
  await Promise.all(list);
  fse.remove(chunkDir);
  ctx.body = util.success();
});
router.post("/verify", async (ctx) => {
  const { fileHash, fileName } = ctx.request.body;
  const filePath = path.resolve(
    UPLOAD_DIR,
    fileHash + util.extractExt(fileName)
  );
  // 获取已经上传到服务器的切片
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
  let chunkPaths = [];
  if (fse.existsSync(chunkDir)) {
    chunkPaths = await fse.readdir(chunkDir);
  }

  // 如果文件存在不需要上传
  if (fse.existsSync(filePath)) {
    ctx.body = util.success({ shouldUpload: false });
  } else {
    // 如果文件不存在,则需要上传
    ctx.body = util.success({ shouldUpload: true, existChunks: chunkPaths });
  }
});
module.exports = router;
