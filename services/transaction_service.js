// const mongoose = require("mongoose");

// async function withTransaction(fn) {
//   const session = await mongoose.startSession();
//   const afterCommitCallbacks = [];
//   const registerAfterCommit = (cb) => afterCommitCallbacks.push(cb);

//   try {
//     session.startTransaction();
//     const result = await fn(session, registerAfterCommit);
//     await session.commitTransaction();
//     for (const cb of afterCommitCallbacks) cb();
//     return result;
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// }
// module.exports = {
//   withTransaction,
// };

const mongoose = require("mongoose");

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  const afterCommitCallbacks = [];
  const registerAfterCommit = (cb) => afterCommitCallbacks.push(cb);
  let commitAttempted = false;

  try {
    session.startTransaction();
    const result = await fn(session, registerAfterCommit);

    commitAttempted = true;
    await session.commitTransaction();

    for (const cb of afterCommitCallbacks) cb();
    return result;
  } catch (err) {
    if (!commitAttempted) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error(
          "[withTransaction] Secondary abortTransaction error (ignored):",
          abortErr.message,
        );
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction };
