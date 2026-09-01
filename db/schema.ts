import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const restaurantTables = sqliteTable("restaurant_tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchantId: text("merchant_id"),
  name: text("name").notNull(),
  token: text("token").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("restaurant_tables_token_unique").on(table.token),
  index("restaurant_tables_merchant_active_idx").on(table.merchantId, table.active, table.createdAt),
  index("restaurant_tables_active_idx").on(table.active, table.createdAt),
]);

export const menuCategories = sqliteTable("menu_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [uniqueIndex("menu_categories_name_unique").on(table.name)]);

export const menuProducts = sqliteTable("menu_products", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  imageKey: text("image_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("menu_products_active_category_idx").on(table.active, table.category)]);

export const tableOrders = sqliteTable("table_orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  tableId: integer("table_id").notNull().references(() => restaurantTables.id),
  clientRequestId: text("client_request_id").notNull(),
  sessionId: text("session_id"),
  status: text("status").notNull().default("new"),
  totalCents: integer("total_cents").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("table_orders_number_unique").on(table.orderNumber),
  uniqueIndex("table_orders_client_request_unique").on(table.clientRequestId),
  index("table_orders_status_created_idx").on(table.status, table.createdAt),
  index("table_orders_table_status_idx").on(table.tableId, table.status),
  index("table_orders_table_session_idx").on(table.tableId, table.sessionId, table.createdAt),
]);

export const tableOrderItems = sqliteTable("table_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => tableOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  priceCents: integer("price_cents").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [index("table_order_items_order_idx").on(table.orderId)]);

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),
  source: text("source").notNull().default("local"),
  syncedAt: text("synced_at"),
  status: text("status").notNull().default("active"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("agents_code_unique").on(table.code),
  uniqueIndex("agents_phone_unique").on(table.phone),
  uniqueIndex("agents_external_id_unique").on(table.externalId),
  index("agents_status_created_idx").on(table.status, table.createdAt),
]);

export const merchantApplications = sqliteTable("merchant_applications", {
  id: text("id").primaryKey(),
  applicationNumber: text("application_number").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  phone: text("phone").notNull(),
  username: text("username"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  passwordIterations: integer("password_iterations"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  address: text("address").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  locationAccuracyM: real("location_accuracy_m"),
  mapUrl: text("map_url").notNull().default(""),
  businessDescription: text("business_description").notNull(),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentReference: text("agent_reference").notNull().default(""),
  kycStatus: text("kyc_status").notNull().default("pending"),
  kycNote: text("kyc_note").notNull().default(""),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("submitted"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("merchant_applications_number_unique").on(table.applicationNumber),
  uniqueIndex("merchant_applications_request_unique").on(table.clientRequestId),
  uniqueIndex("merchant_applications_username_unique").on(table.username),
  index("merchant_applications_phone_created_idx").on(table.phone, table.createdAt),
  index("merchant_applications_status_created_idx").on(table.status, table.createdAt),
  index("merchant_applications_agent_kyc_idx").on(table.agentId, table.kycStatus, table.createdAt),
  index("merchant_applications_kyc_created_idx").on(table.kycStatus, table.createdAt),
]);

export const merchantMenuCategories = sqliteTable("merchant_menu_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchantId: text("merchant_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [
  uniqueIndex("merchant_menu_categories_merchant_name_unique").on(table.merchantId, table.name),
  index("merchant_menu_categories_merchant_position_idx").on(table.merchantId, table.position),
]);

export const merchantMenuProducts = sqliteTable("merchant_menu_products", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  localProductId: integer("local_product_id").notNull(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  imageKey: text("image_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  moderationStatus: text("moderation_status").notNull().default("approved"),
  riskLevel: text("risk_level").notNull().default("safe"),
  riskCategory: text("risk_category").notNull().default(""),
  riskReason: text("risk_reason").notNull().default(""),
  matchedTerms: text("matched_terms").notNull().default("[]"),
  scannedAt: text("scanned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("merchant_menu_products_merchant_local_unique").on(table.merchantId, table.localProductId),
  index("merchant_menu_products_merchant_active_idx").on(table.merchantId, table.active, table.category),
  index("merchant_menu_products_moderation_idx").on(table.moderationStatus, table.riskLevel, table.updatedAt),
]);

export const productModerationAlerts = sqliteTable("product_moderation_alerts", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => merchantMenuProducts.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  reason: text("reason").notNull(),
  matchedTerms: text("matched_terms").notNull().default("[]"),
  status: text("status").notNull().default("open"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("product_moderation_alerts_status_created_idx").on(table.status, table.createdAt),
  index("product_moderation_alerts_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
  index("product_moderation_alerts_product_status_idx").on(table.productId, table.status),
]);

export const paymentTransactions = sqliteTable("payment_transactions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  clientRequestId: text("client_request_id").notNull(),
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  context: text("context").notNull().default(""),
  source: text("source").notNull().default("merchant_app"),
  status: text("status").notNull().default("success"),
  feeRateBps: integer("fee_rate_bps").notNull().default(0),
  feeCents: integer("fee_cents").notNull().default(0),
  netAmountCents: integer("net_amount_cents").notNull().default(0),
  membershipPlan: text("membership_plan").notNull().default("standard"),
  freeQuotaAppliedCents: integer("free_quota_applied_cents").notNull().default(0),
  quotaCycleStartedAt: text("quota_cycle_started_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("payment_transactions_request_unique").on(table.clientRequestId),
  index("payment_transactions_merchant_created_idx").on(table.merchantId, table.createdAt),
  index("payment_transactions_method_created_idx").on(table.method, table.createdAt),
  index("payment_transactions_status_created_idx").on(table.status, table.createdAt),
]);

export const merchantMemberships = sqliteTable("merchant_memberships", {
  merchantId: text("merchant_id").primaryKey().references(() => merchantApplications.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull().default("subscriber"),
  status: text("status").notNull().default("active"),
  activationFeeCents: integer("activation_fee_cents").notNull().default(29000),
  dailyFeeCents: integer("daily_fee_cents").notNull().default(1000),
  promptpayQuotaCents: integer("promptpay_quota_cents").notNull().default(3000000),
  promptpayUsedCents: integer("promptpay_used_cents").notNull().default(0),
  currentCycleStart: text("current_cycle_start").notNull(),
  currentCycleEnd: text("current_cycle_end").notNull(),
  lastDailyChargeDate: text("last_daily_charge_date").notNull(),
  outstandingCents: integer("outstanding_cents").notNull().default(0),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  cancelledAt: text("cancelled_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("merchant_memberships_status_cycle_idx").on(table.status, table.currentCycleEnd),
]);

export const merchantFinancialAccounts = sqliteTable("merchant_financial_accounts", {
  merchantId: text("merchant_id").primaryKey().references(() => merchantApplications.id, { onDelete: "cascade" }),
  availableBalanceCents: integer("available_balance_cents").notNull().default(0),
  totalTransactionFeesCents: integer("total_transaction_fees_cents").notNull().default(0),
  totalServiceFeesCents: integer("total_service_fees_cents").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const membershipChargeLedger = sqliteTable("membership_charge_ledger", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  chargeType: text("charge_type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("pending"),
  description: text("description").notNull().default(""),
  paymentSource: text("payment_source").notNull().default("merchant_balance"),
  attemptCount: integer("attempt_count").notNull().default(0),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("membership_charge_merchant_type_due_unique").on(table.merchantId, table.chargeType, table.dueDate),
  index("membership_charge_merchant_status_due_idx").on(table.merchantId, table.status, table.dueDate),
  index("membership_charge_status_due_idx").on(table.status, table.dueDate),
]);

export const merchantSessions = sqliteTable("merchant_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  applicationId: text("application_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("merchant_sessions_application_expiry_idx").on(table.applicationId, table.expiresAt),
  index("merchant_sessions_expiry_idx").on(table.expiresAt),
]);

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  username: text("username").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("admin_sessions_expiry_idx").on(table.expiresAt)]);

export const kycReviews = sqliteTable("kyc_reviews", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull().references(() => merchantApplications.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status").notNull(),
  nextStatus: text("next_status").notNull(),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
  reviewedBy: text("reviewed_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("kyc_reviews_application_created_idx").on(table.applicationId, table.createdAt),
  index("kyc_reviews_agent_created_idx").on(table.agentId, table.createdAt),
]);
