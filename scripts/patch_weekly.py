import sys

with open("spy_weekly.json", "r", encoding="utf-8") as f:
    weekly_js = f.read().strip()

with open("portfolio_v2.html", "r", encoding="utf-8") as f:
    content = f.read()

import re
pattern1 = re.compile(r'const spyHistoricalData = \{.*?\};', re.DOTALL)
content = pattern1.sub(weekly_js, content)

old_logic = """                            // אין נתונים זמינים מה-API. נשתמש במחירי הפתיחה/סגירה האמיתיים שהוזרקו דרך הפייתון
                            const d = new Date(t);
                            const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                            
                            // אם אנחנו בחודש הנוכחי (מבחינת זמן ריצה), הנתון close שבידינו הוא מהיום הנוכחי בלבד, אז לא נרצה לדלל אותו לכל החודש
                            const now = new Date();
                            const isCurrentMonth = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
                            const effectiveDaysInMonth = isCurrentMonth && now.getDate() > 1 ? now.getDate() : lastDayOfMonth;
                            
                            const monthStr = (d.getMonth() + 1).toString().padStart(2, '0');
                            const monthKey = `${d.getFullYear()}-${monthStr}`;
                            
                            let projectedPrice = 4000;
                            let monthSpread = 0.04;
                            
                            if (spyHistoricalData[monthKey]) {
                                const { open, high, low, close } = spyHistoricalData[monthKey];
                                monthSpread = Math.abs((high / low) - 1) || 0.04; 
                                
                                // פיזור לינארי של הפער מתחילת החודש לסיים החודש בעל הנתונים
                                const progress = Math.min(1, (d.getDate() - 1) / (effectiveDaysInMonth - 1 || 1));
                                projectedPrice = open + (close - open) * progress;
                            } else {
                                // מחירי גיבוי פשוטים אם חסר חודש
                                projectedPrice = lastRealSpyPrice !== null ? lastRealSpyPrice * 1.0003 : 4000;
                            }
                            
                            const exactVolScaling = Math.max(0.001, (monthSpread / lastDayOfMonth));"""

new_logic = """                            // אין נתונים זמינים מה-API. נשתמש במחירי הפתיחה/סגירה האמיתיים שהוזרקו דרך הפייתון
                            const d = new Date(t);
                            const now = new Date();
                            
                            let weekData = null;
                            let weekStartD = new Date(d);
                            // מחפשים במאגר השבועי אחורה עד 7 ימים
                            for(let i=0; i<8; i++) {
                                const y = weekStartD.getFullYear();
                                const m = (weekStartD.getMonth() + 1).toString().padStart(2, '0');
                                const dd = weekStartD.getDate().toString().padStart(2, '0');
                                const weekKey = `${y}-${m}-${dd}`;
                                if (spyHistoricalData[weekKey]) {
                                    weekData = spyHistoricalData[weekKey];
                                    break;
                                }
                                weekStartD.setDate(weekStartD.getDate() - 1);
                            }
                            
                            let projectedPrice = 4000;
                            let spread = 0.04;
                            let daysInPeriod = 7;
                            
                            if (weekData) {
                                const { open, high, low, close } = weekData;
                                spread = Math.abs((high / low) - 1) || 0.04; 
                                
                                let effectiveDays = 7;
                                if (now.getTime() - weekStartD.getTime() < 7 * 86400000) {
                                    effectiveDays = Math.max(1, Math.floor((now.getTime() - weekStartD.getTime()) / 86400000));
                                }
                                
                                const elapsedDays = (d.getTime() - weekStartD.getTime()) / 86400000;
                                const progress = Math.min(1, Math.max(0, elapsedDays / effectiveDays));
                                projectedPrice = open + (close - open) * progress;
                            } else {
                                // מחירי גיבוי פשוטים אם חסר שבוע
                                projectedPrice = lastRealSpyPrice !== null ? lastRealSpyPrice * 1.0003 : 4000;
                            }
                            
                            const exactVolScaling = Math.max(0.001, (spread / daysInPeriod));"""

content = content.replace(old_logic, new_logic)

with open("portfolio_v2.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Patched portfolio_v2.html!")
