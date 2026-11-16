# src/lib rules
- Bài 11.1 scheduled hand-out stores the future moment in classrooms.started_at and every cube read/submit checks assignmentStarted on the server clock, so release happens exactly on time without a timer job and other lessons are untouched.
- The teacher's screen in timed Bài 12 parts shows sharedQuestion (slowest team's reconciled step), selected only when it changes, so manual Enter/Backspace still work and team clocks stay independent.
