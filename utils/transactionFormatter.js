function shortRef(objectId) {
  return `TXN-${objectId.toString().slice(-6).toUpperCase()}`;
}

function buildTransactionEntry(circulation, type, opts = {}) {
  const copy = circulation.copy_id;
  const book = copy?.book_id;

  return {
    ref: shortRef(circulation._id),
    circulation_id: circulation._id,
    type,
    timestamp:
      type === "CHECKOUT" ? circulation.checkout_date : circulation.return_date,
    member: circulation.user_id
      ? {
          name: circulation.user_id.name,
          username: circulation.user_id.username,
          role: circulation.user_id.role,
        }
      : null,
    book_title: book?.title ?? null,
    accession_number: copy?.accession_number ?? null,
    rfid_tag_id: copy?.rfid_tag_id ?? null,
    handled_by: opts.handledBy ?? null,
  };
}

module.exports = { shortRef, buildTransactionEntry };
