// An http or https address in a mail's text. An address that stands alone on its line is taken whole,
// so its last characters stay as the sender wrote them. Any other address stops at a space, a quote
// or a closing bracket, and leaves out the punctuation that ends a sentence.
export const mailURLPattern =
  /(?<=^[ \t]*)https?:\/\/\S+(?=[ \t]*$)|https?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gimu;
