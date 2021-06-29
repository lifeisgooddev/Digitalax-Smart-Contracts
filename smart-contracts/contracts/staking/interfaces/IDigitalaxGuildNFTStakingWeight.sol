// SPDX-License-Identifier: GPLv2

pragma solidity 0.6.12;

/// @dev an interface to interact with the Guild Staking Weight that will 
interface IDigitalaxGuildNFTStakingWeight {
    function updateWeight() external returns (bool);
    function updateOwnerWeight(address _tokenOwner) external returns (bool);
    function appraise(uint256 _tokenId, address _appraiser, uint256 _limitAppraisalCount, string memory _appraiseAction) external;
    function stake(uint256 _tokenId, address _tokenOwner, uint256 _primarySalePrice) external;
    function unstake(uint256 _tokenId, address _tokenOwner) external;

    function getTotalWeight() external view returns (uint256);
    function getOwnerWeight(address _tokenOwner) external view returns (uint256);
    function getTokenPrice(uint256 _tokenId) external view returns (uint256);
}
