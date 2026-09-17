// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Freely mintable ERC20 standing in for chUSD on the local harness chain.
contract LocalTestToken {
  string public constant name = 'Local Test USD';
  string public constant symbol = 'chUSD';
  uint8 public constant decimals = 18;

  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  error LocalTestToken__InsufficientBalance(uint256 balance, uint256 needed);
  error LocalTestToken__InsufficientAllowance(uint256 allowance_, uint256 needed);

  function mint(address to, uint256 amount) external {
    totalSupply += amount;
    balanceOf[to] += amount;
    emit Transfer(address(0), to, amount);
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    emit Approval(msg.sender, spender, amount);
    return true;
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    uint256 allowed = allowance[from][msg.sender];
    if (allowed != type(uint256).max) {
      if (allowed < amount) revert LocalTestToken__InsufficientAllowance(allowed, amount);
      allowance[from][msg.sender] = allowed - amount;
    }
    _transfer(from, to, amount);
    return true;
  }

  function _transfer(address from, address to, uint256 amount) private {
    uint256 balance = balanceOf[from];
    if (balance < amount) revert LocalTestToken__InsufficientBalance(balance, amount);
    unchecked {
      balanceOf[from] = balance - amount;
    }
    balanceOf[to] += amount;
    emit Transfer(from, to, amount);
  }
}
