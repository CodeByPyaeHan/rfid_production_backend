const DUPLICATE_FIELD_LABELS = {
  roll_number: "Roll number",
  username: "Username",
  email: "Email address",
  nrc_number: "NRC number",
  rfid_tag_id: "RFID tag",
  rfid_card_uid: "RFID card",
  accession_number: "Accession number",
};

function formatDuplicateKeyMessage(err) {
  const field = err.keyValue ? Object.keys(err.keyValue)[0] : null;
  const value = field ? err.keyValue[field] : null;
  const label = DUPLICATE_FIELD_LABELS[field] || field || "This value";

  return value
    ? `${label} "${value}" is already in use. Please use a different one.`
    : `${label} is already in use. Please use a different one.`;
}

module.exports = { formatDuplicateKeyMessage };
