import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const restaurantTables = sqliteTable("restaurant_tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  token: text("token").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("restaurant_tables_token_unique").on(table.token),
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
]);

export const tableOrderItems = sqliteTable("table_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => tableOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  priceCents: integer("price_cents").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [index("table_order_items_order_idx").on(table.orderId)]);
