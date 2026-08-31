export const defaultMenuCategories = ["อาหารจานเดียว", "กับข้าว", "ของทานเล่น", "เครื่องดื่ม", "ของหวาน", "สินค้าอื่นๆ"];

export const defaultMenuProducts = [
  { id: 1, name: "กะเพราไก่ไข่ดาว", price: 75, category: "อาหารจานเดียว", description: "", image: null, active: true },
  { id: 2, name: "ข้าวผัดกุ้ง", price: 85, category: "อาหารจานเดียว", description: "", image: null, active: true },
  { id: 3, name: "ต้มยำกุ้ง", price: 150, category: "กับข้าว", description: "", image: null, active: true },
  { id: 4, name: "ชาไทย", price: 45, category: "เครื่องดื่ม", description: "", image: null, active: true },
  { id: 5, name: "อเมริกาโน่", price: 55, category: "เครื่องดื่ม", description: "", image: null, active: true },
  { id: 6, name: "น้ำเปล่า", price: 20, category: "เครื่องดื่ม", description: "", image: null, active: true },
] as const;
