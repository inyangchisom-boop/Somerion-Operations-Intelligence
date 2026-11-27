import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "mocha";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, Timestamp, runTransaction, serverTimestamp } from "firebase/firestore";

const projectId = "demo-somerion-oi";
let testEnv;
const createdAt = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));
const updatedAt = Timestamp.fromDate(new Date("2026-01-02T00:00:00.000Z"));
async function submitFeedback(db, id, feedback) {
  const rateRef = doc(db, "feedbackRateLimits", feedback.uid);
  const feedbackRef = doc(db, "feedback", id);
  await runTransaction(db, async transaction => {
    await transaction.get(rateRef);
    transaction.set(rateRef, { uid: feedback.uid, lastSubmittedAt: serverTimestamp() });
    transaction.set(feedbackRef, feedback);
  });
}


const customer = {
  name: "Test Customer",
  company: "Example Co",
  email: "test@example.com",
  phone: "+10000000000",
  stage: "lead",
  notes: "Test record",
  createdAt,
  updatedAt: createdAt
};

describe("Somerion Firestore security rules", function () {
  before(async function () {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules: readFileSync("firestore.rules", "utf8") }
    });
  });

  beforeEach(async function () {
    await testEnv.clearFirestore();
  });

  after(async function () {
    if (testEnv) await testEnv.cleanup();
  });

  it("allows a signed-in user to create and read their own CRM record", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    const ref = doc(db, "users/user-a/customers/customer-1");
    await assertSucceeds(setDoc(ref, customer));
    const result = await assertSucceeds(getDoc(ref));
    assert.equal(result.data().name, customer.name);
  });

  it("blocks one user from reading another user's records", async function () {
    const userB = testEnv.authenticatedContext("user-b").firestore();
    await assertSucceeds(setDoc(doc(userB, "users/user-b/customers/private-1"), customer));
    const userA = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(getDoc(doc(userA, "users/user-b/customers/private-1")));
  });

  it("blocks unauthenticated reads and writes", async function () {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/user-a/customers/customer-1")));
    await assertFails(setDoc(doc(db, "users/user-a/customers/customer-1"), customer));
  });

  it("rejects CRM records with an unsupported relationship stage", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(setDoc(doc(db, "users/user-a/customers/invalid-1"), {
      ...customer,
      stage: "administrator"
    }));
  });

  it("allows valid records for Projects, Tasks, Service Jobs and Finance", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    const records = [
      ["projects/project-1", {
        name: "Website rollout", client: "Example Co", status: "active",
        startDate: "2026-01-01", dueDate: "2026-02-01", description: "Test project",
        createdAt, updatedAt: createdAt
      }],
      ["tasks/task-1", {
        title: "Prepare launch", projectId: "project-1", projectName: "Website rollout",
        assignee: "Owner", status: "todo", dueDate: "2026-01-15", details: "Test task",
        createdAt, updatedAt: createdAt
      }],
      ["serviceJobs/job-1", {
        title: "Initial consultation", customer: "Test Customer", serviceType: "Consultation",
        status: "scheduled", scheduledAt: "2026-01-10T10:00", location: "Online",
        notes: "Test booking", createdAt, updatedAt: createdAt
      }],
      ["finance/entry-1", {
        type: "income", description: "Test sale", category: "Sales", amount: 100,
        currency: "USD", entryDate: "2026-01-01", reference: "INV-001",
        createdAt, updatedAt: createdAt
      }]
    ];

    for (const [path, data] of records) {
      await assertSucceeds(setDoc(doc(db, "users/user-a/" + path), data));
    }
  });

  it("requires the original createdAt timestamp to remain unchanged on updates", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    const ref = doc(db, "users/user-a/customers/customer-1");
    await assertSucceeds(setDoc(ref, customer));
    await assertSucceeds(updateDoc(ref, { notes: "Updated note", updatedAt }));
    await assertFails(updateDoc(ref, { createdAt: updatedAt, updatedAt }));
  });

  it("rejects writes outside explicitly permitted user collections", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(setDoc(doc(db, "privateRecords/record-1"), { value: "blocked" }));
  });

  it("allows a valid Business Profile and blocks an invalid currency code", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    const ref = doc(db, "users/user-a/settings/businessProfile");
    const profile = {
      businessName: "Example Co",
      industry: "commerce",
      businessSize: "small",
      country: "Philippines",
      baseCurrency: "PHP",
      createdAt,
      updatedAt: createdAt
    };
    await assertSucceeds(setDoc(ref, profile));
    await assertFails(setDoc(ref, { ...profile, baseCurrency: "PESO" }));
  });

  it("continues to allow valid existing order and inventory records", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertSucceeds(setDoc(doc(db, "users/user-a/orders/order-1"), {
      reference: "ORD-001", customer: "Test Customer", total: 25.5,
      status: "Pending", currency: "PHP", createdAt, updatedAt: createdAt
    }));
    await assertSucceeds(setDoc(doc(db, "users/user-a/products/product-1"), {
      name: "Test product", sku: "SKU-001", quantity: 12,
      reorderLevel: 3, createdAt, updatedAt: createdAt
    }));
  });


  it("allows signed-in users to submit private feedback and read only their own pending submissions", async function () {
    const userA = testEnv.authenticatedContext("user-a").firestore();
    const userB = testEnv.authenticatedContext("user-b").firestore();
    const ref = doc(userA, "feedback/feedback-a");
    const feedback = {
      uid: "user-a", rating: 5, category: "Ease of use",
      message: "The dashboard is clear and useful.",
      status: "pending", published: false, createdAt, updatedAt: createdAt
    };
    await assertSucceeds(submitFeedback(userA, "feedback-a", feedback));
    await assertSucceeds(getDoc(ref));
    await assertFails(getDoc(doc(userB, "feedback/feedback-a")));
  });

  it("blocks unauthenticated feedback submissions and private feedback reads", async function () {
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const feedback = {
      uid: "user-a", rating: 4, category: "Design and appearance",
      message: "The layout looks good to me.", status: "pending",
      published: false, createdAt, updatedAt: createdAt
    };
    await assertFails(setDoc(doc(anonymous, "feedback/anonymous"), feedback));
    await assertFails(getDoc(doc(anonymous, "feedback/private")));
  });

  it("rejects invalid feedback rating, category, and short messages", async function () {
    const db = testEnv.authenticatedContext("user-a").firestore();
    const base = {
      uid: "user-a", rating: 5, category: "Ease of use",
      message: "A valid feedback message.", status: "pending",
      published: false, createdAt, updatedAt: createdAt
    };
    await assertFails(setDoc(doc(db, "feedback/bad-rating"), {...base, rating: 6}));
    await assertFails(setDoc(doc(db, "feedback/bad-category"), {...base, category: "Admin access"}));
    await assertFails(setDoc(doc(db, "feedback/short-message"), {...base, message: "No"}));
    await assertFails(setDoc(doc(db, "feedback/forged-owner"), {...base, uid: "user-b"}));
  });

  it("allows only the configured owner to publish a review, then allows public reading", async function () {
    const userDb = testEnv.authenticatedContext("user-a").firestore();
    const ownerDb = testEnv.authenticatedContext("MnTpG1cRJETCZMs8fbg6tDMkRvA2").firestore();
    const publicDb = testEnv.unauthenticatedContext().firestore();
    const ref = doc(userDb, "feedback/review-1");
    await assertSucceeds(submitFeedback(userDb, "review-1", {
      uid: "user-a", rating: 5, category: "Features and tools",
      message: "I would like to see more reporting options.",
      status: "pending", published: false, createdAt, updatedAt: createdAt
    }));
    await assertFails(updateDoc(ref, {
      published: true, status: "published", publishedAt: updatedAt, updatedAt
    }));
    await assertFails(getDoc(doc(publicDb, "feedback/review-1")));
    const ownerRef = doc(ownerDb, "feedback/review-1");
    await assertSucceeds(updateDoc(ownerRef, {
      published: true, status: "published", publishedAt: updatedAt, updatedAt
    }));
    const publicResult = await assertSucceeds(getDoc(doc(publicDb, "feedback/review-1")));
    assert.equal(publicResult.data().published, true);
    assert.equal(publicResult.data().message, "I would like to see more reporting options.");
  });

  it("enforces a five-minute feedback submission cooldown in Firestore rules", async function () {
    const db = testEnv.authenticatedContext("rate-limited-user").firestore();
    const base = {
      uid: "rate-limited-user", rating: 4, category: "Ease of use",
      message: "A valid message for the cooldown test.", status: "pending",
      published: false, createdAt, updatedAt: createdAt
    };
    await assertSucceeds(submitFeedback(db, "first-review", base));
    await assertFails(submitFeedback(db, "second-review", base));
  });

  it("allows the configured owner to read the private moderation queue", async function () {
    const userDb = testEnv.authenticatedContext("user-a").firestore();
    const ownerDb = testEnv.authenticatedContext("MnTpG1cRJETCZMs8fbg6tDMkRvA2").firestore();
    const ref = doc(userDb, "feedback/owner-queue");
    await assertSucceeds(submitFeedback(userDb, "owner-queue", {
      uid: "user-a", rating: 3, category: "Other",
      message: "There is room for improvement.",
      status: "pending", published: false, createdAt, updatedAt: createdAt
    }));
    await assertSucceeds(getDoc(doc(ownerDb, "feedback/owner-queue")));
  });

});
