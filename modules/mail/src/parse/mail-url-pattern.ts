// An http or https address in a mail's text. It stops at a space, a quote or a closing bracket, and
// leaves out the punctuation that ends a sentence.
export const mailURLPattern = /https?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?]/giu;
