/**
 * Full text of the mutual short-form NDA presented to the investor on the
 * Review-and-Sign screen. Kept in plain markdown so it renders inline.
 *
 * If you ever change this, also bump the templateVersion in
 * src/lib/services/nda.ts so audit logs distinguish before-and-after signers.
 */
export const MUTUAL_NDA_TEMPLATE_VERSION = '2026-04-26-v1';

export const MUTUAL_NDA_MARKDOWN = `## Mutual Non-Disclosure Agreement

**This Mutual Non-Disclosure Agreement (the "Agreement") is entered into between the signatory below (the "Investor") and OotaOS Platform Services Private Limited, a company incorporated under the Companies Act, 2013 of India, with its registered office in Bengaluru, Karnataka (the "Company"). Each party may be referred to individually as a "Party" and collectively as the "Parties".**

### 1. Purpose
The Parties wish to discuss a potential investment in the Company and, in connection with that discussion, may share with one another non-public information about their respective businesses, financials, technology, customers, and personnel ("Confidential Information").

### 2. Confidential Information
"Confidential Information" means any non-public information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party") in any form — written, oral, visual, or electronic — that is marked or identified as confidential, or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure. Confidential Information includes, without limitation, financial statements, cap tables, term sheets, business plans, product roadmaps, customer lists, pricing, source code, trade secrets, partner agreements, and unpublished metrics.

### 3. Obligations of the Receiving Party
The Receiving Party shall:

(a) hold all Confidential Information in strict confidence and use the same degree of care it uses to protect its own confidential information of like importance, but in no event less than reasonable care;

(b) use the Confidential Information solely for the purpose of evaluating the potential investment, and not for any competitive, commercial, or personal purpose;

(c) limit access to the Confidential Information to its employees, officers, directors, advisors, attorneys, accountants, and authorised representatives who have a clear need to know for the stated purpose, and who are bound by confidentiality obligations no less stringent than those of this Agreement; and

(d) not reproduce, copy, or distribute the Confidential Information beyond what is reasonably required for the stated purpose.

### 4. Exclusions
The obligations in Section 3 do not apply to information that:

(a) is or becomes publicly known through no fault of the Receiving Party;

(b) was lawfully in the Receiving Party's possession before disclosure by the Disclosing Party, free of any obligation of confidentiality;

(c) is rightfully received by the Receiving Party from a third party without breach of any obligation of confidentiality; or

(d) is independently developed by the Receiving Party without use of or reference to the Confidential Information.

### 5. Compelled Disclosure
If the Receiving Party is compelled by law, court order, or governmental authority to disclose any Confidential Information, the Receiving Party shall, to the extent legally permitted, give the Disclosing Party prompt written notice and reasonable cooperation so that the Disclosing Party may seek a protective order or other appropriate remedy. If a remedy is not obtained, the Receiving Party shall disclose only that portion of the Confidential Information that is legally required.

### 6. No Licence
Nothing in this Agreement grants the Receiving Party any licence, ownership, or other right in the Confidential Information or in any patent, trademark, copyright, or other intellectual property of the Disclosing Party. All Confidential Information remains the sole property of the Disclosing Party.

### 7. No Obligation to Proceed
Neither Party is obligated by this Agreement to make any disclosure, to proceed with any transaction, or to enter into any further agreement. Either Party may terminate discussions at any time without liability.

### 8. Term and Return
The obligations of confidentiality and non-use under this Agreement continue for a period of **two (2) years** from the date of signature. Upon written request of the Disclosing Party, the Receiving Party shall promptly destroy or return all Confidential Information in its possession, and shall confirm such destruction or return in writing if requested.

### 9. Remedies
The Parties acknowledge that money damages may be insufficient for a breach of this Agreement, and that the Disclosing Party shall be entitled to seek injunctive relief and specific performance, in addition to any other remedies available at law or in equity, without the necessity of posting a bond.

### 10. No Solicitation of Employees
For a period of one (1) year from the date of signature, neither Party shall solicit for employment any employee of the other Party with whom they have come into contact through this discussion, without the prior written consent of the other Party. General advertising and recruiter postings are not considered solicitation.

### 11. No Warranty
All Confidential Information is provided "as is", without warranty of any kind, express or implied, including any warranty of accuracy, completeness, or fitness for a particular purpose. Neither Party shall be liable to the other for any reliance placed on the Confidential Information beyond the obligations expressly set out in this Agreement.

### 12. Governing Law and Jurisdiction
This Agreement is governed by the laws of the Republic of India. The Parties submit to the exclusive jurisdiction of the courts of Bengaluru, Karnataka, for any dispute arising under or in connection with this Agreement.

### 13. Entire Agreement
This Agreement constitutes the entire understanding between the Parties with respect to its subject matter and supersedes all prior or contemporaneous agreements, whether written or oral, on the same subject. Any amendment must be in writing and signed by both Parties.

### 14. Counterparts and Electronic Signature
This Agreement may be executed in counterparts and by electronic signature, each of which shall be deemed an original and all of which together shall constitute one and the same instrument.

---

**By clicking "Sign and enter the data room" below, the Investor confirms that they have read, understood, and agreed to be bound by the terms of this Mutual Non-Disclosure Agreement, and that the name, title, and firm they have provided are accurate.**`;
