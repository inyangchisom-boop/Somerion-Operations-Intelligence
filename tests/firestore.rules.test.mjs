import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "mocha";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";

const projectId = "demo-somerion-oi";
let testEnv;
const createdAt = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));
const updatedAt = Timestamp.fromDate(new Date("2026-01-02T00:00:00.000Z"));

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
});
