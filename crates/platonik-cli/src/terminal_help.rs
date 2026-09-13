use std::env;
use std::io::{self, IsTerminal, Write};

const MICROBE: &str = "   \\ | /\n --( : )--\n   / | \\\n\n";

pub fn print_root_help(help: &str) -> io::Result<()> {
    let stdout = io::stdout();
    let terminal = env::var("TERM").ok();
    write_root_help(
        &mut stdout.lock(),
        help,
        stdout.is_terminal(),
        terminal.as_deref(),
        env::var_os("CI").is_some(),
    )
}

fn write_root_help(
    output: &mut impl Write,
    help: &str,
    is_terminal: bool,
    terminal: Option<&str>,
    is_ci: bool,
) -> io::Result<()> {
    if is_terminal
        && !is_ci
        && terminal.is_some_and(|value| {
            let value = value.trim();
            !value.is_empty() && !value.eq_ignore_ascii_case("dumb")
        })
    {
        output.write_all(MICROBE.as_bytes())?;
    }
    output.write_all(help.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELP: &str = "Platonik — a bounded, local engineering laboratory\n\nUsage:\n";

    #[test]
    fn a_capable_interactive_terminal_gets_the_microbe_and_one_intro() {
        let mut output = Vec::new();
        write_root_help(&mut output, HELP, true, Some("xterm-256color"), false).unwrap();
        assert_eq!(output, format!("{MICROBE}{HELP}").as_bytes());
        assert_eq!(
            String::from_utf8(output)
                .unwrap()
                .matches("Platonik")
                .count(),
            1
        );
        assert!(MICROBE.is_ascii());
        assert!(!MICROBE.contains('\u{1b}'));
    }

    #[test]
    fn pipes_ci_and_limited_terminals_keep_the_exact_plain_help() {
        for is_terminal in [false, true] {
            for is_ci in [false, true] {
                for terminal in [None, Some(""), Some("  "), Some("dumb"), Some("DUMB")] {
                    let mut output = Vec::new();
                    write_root_help(&mut output, HELP, is_terminal, terminal, is_ci).unwrap();
                    assert_eq!(output, HELP.as_bytes());
                }
            }
        }
        for (is_terminal, is_ci) in [(false, false), (false, true), (true, true)] {
            let mut output = Vec::new();
            write_root_help(&mut output, HELP, is_terminal, Some("xterm"), is_ci).unwrap();
            assert_eq!(output, HELP.as_bytes());
        }
    }

    #[test]
    fn failed_output_is_reported_without_retrying_the_write() {
        struct BrokenOutput(usize);
        impl Write for BrokenOutput {
            fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                self.0 += 1;
                Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed output"))
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let mut output = BrokenOutput(0);
        let error = write_root_help(&mut output, HELP, true, Some("xterm"), false).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
        assert_eq!(output.0, 1);
    }
}
